import "server-only";
import type { Employe } from "@/lib/data";
import type {
  GpecCampagneStatut,
  GpecEvaluation,
  GpecFamille,
  GpecEmploiType,
  GpecCompetenceSocle,
} from "@/lib/db";
import {
  setGpecEchelleNiveau,
  getOrCreateGpecFamille,
  getOrCreateGpecEmploiType,
  getOrCreateGpecCompetenceSocle,
  getOrCreateGpecCompetence,
  upsertGpecPersonneByMatricule,
  listGpecCompetencesForEmploiType,
  listGpecPersonnes,
  generateGpecEvaluations,
} from "@/lib/db";
import { parseGpecReferentiels, matchPersonneToEmploye } from "@/lib/gpecImport";

/** Neos roles that count as GPEC "RH-Admin" — deliberately narrower than
 * lib/authz.ts's isRH(): that helper lumps ROLE_SG in with RH for the rest
 * of the app, but the cahier des charges treats ROLE_SG as "Direction", a
 * distinct GPEC role with its own (read-only, aggregated-by-default)
 * visibility — see isGpecDirection below. */
const GPEC_ADMIN_ROLES = new Set(["ROLE_RH", "ROLE_SUPER_ADMIN"]);

export function isGpecAdmin(roles: string[]): boolean {
  return roles.some((r) => GPEC_ADMIN_ROLES.has(r));
}

/** Direction = ROLE_SG only, confirmed with Ornella — no other role grants
 * it, and RH-Admin isn't automatically Direction either (they're separate
 * rows in the cahier des charges' Rôles et permissions table). */
export function isGpecDirection(roles: string[]): boolean {
  return roles.includes("ROLE_SG");
}

// ---------------------------------------------------------------------------
// Règles métier — écart, seuil d'alerte, visibilité croisée (biais d'ancrage)
// ---------------------------------------------------------------------------

export const GPEC_ALERTE_SEUIL = 1;

/** ecart = niveau_auto - niveau_manager — only meaningful once both exist;
 * "non calculable (et non affiché) tant qu'une des deux manque" per §4. */
export function gpecEcart(niveauAuto: number | null, niveauManager: number | null): number | null {
  if (niveauAuto == null || niveauManager == null) return null;
  return niveauAuto - niveauManager;
}

/** ecart_vs_requis = niveau_retenu - niveau_requis — the value that feeds
 * the pilotage dashboards (formation/mobilité), distinct from the
 * auto/manager écart above. */
export function gpecEcartVsRequis(niveauRetenu: number | null, niveauRequis: number): number | null {
  if (niveauRetenu == null) return null;
  return niveauRetenu - niveauRequis;
}

export function isGpecAlerte(ecart: number | null): boolean {
  return ecart != null && Math.abs(ecart) > GPEC_ALERTE_SEUIL;
}

export type GpecViewerRole = "collaborateur" | "manager" | "rh";

export interface GpecEvaluationView {
  id: string;
  competenceId: string;
  niveauAuto: number | null;
  niveauManager: number | null;
  niveauRetenu: number | null;
  ecart: number | null;
  alerte: boolean;
  commentaire: string | null;
}

/** The one place the mutual-blind-evaluation rule lives, so no API route
 * has to reimplement it (and risk leaking a raw row that carries both
 * fields). Non négociable per the cahier des charges:
 * - manager: never sees niveau_auto until their OWN niveau_manager is also
 *   saved on that same row (both complete) — the "biais d'ancrage" rule.
 * - collaborateur: never sees niveau_manager/niveau_retenu/commentaire
 *   before the campagne is clôturée (§3 Module 3), regardless of whether
 *   their own niveau_auto is in yet.
 * - rh: full visibility always — RH oversees the process, it isn't a party
 *   to the blind evaluation itself. */
export function projectGpecEvaluation(
  e: GpecEvaluation,
  campagneStatut: GpecCampagneStatut,
  viewer: GpecViewerRole
): GpecEvaluationView {
  if (viewer === "rh") {
    const ecart = gpecEcart(e.niveauAuto, e.niveauManager);
    return {
      id: e.id,
      competenceId: e.competenceId,
      niveauAuto: e.niveauAuto,
      niveauManager: e.niveauManager,
      niveauRetenu: e.niveauRetenu,
      ecart,
      alerte: isGpecAlerte(ecart),
      commentaire: e.commentaire,
    };
  }

  if (viewer === "manager") {
    const bothComplete = e.niveauAuto != null && e.niveauManager != null;
    const ecart = bothComplete ? gpecEcart(e.niveauAuto, e.niveauManager) : null;
    return {
      id: e.id,
      competenceId: e.competenceId,
      niveauAuto: bothComplete ? e.niveauAuto : null,
      niveauManager: e.niveauManager,
      niveauRetenu: e.niveauRetenu,
      ecart,
      alerte: isGpecAlerte(ecart),
      commentaire: e.commentaire,
    };
  }

  // collaborateur
  const cloturee = campagneStatut === "cloturee";
  const ecart = cloturee ? gpecEcart(e.niveauAuto, e.niveauManager) : null;
  return {
    id: e.id,
    competenceId: e.competenceId,
    niveauAuto: e.niveauAuto,
    niveauManager: cloturee ? e.niveauManager : null,
    niveauRetenu: cloturee ? e.niveauRetenu : null,
    ecart,
    alerte: isGpecAlerte(ecart),
    commentaire: cloturee ? e.commentaire : null,
  };
}

// ---------------------------------------------------------------------------
// Import initial — GPEC_Synelia_Referentiels.xlsx
// ---------------------------------------------------------------------------

export interface GpecImportReport {
  familles: number;
  emploiTypes: number;
  competenceSocles: number;
  competences: number;
  personnesImportees: number;
  personnesNonRattacheesEmploiType: { matricule: string; nom: string; prenoms: string }[];
  personnesNonMatcheesNeos: { matricule: string; nom: string; prenoms: string; entite: string }[];
}

/** Populates Famille/EmploiType/CompetenceSocle/Competence/EchelleNiveau/
 * Personne from the référentiels workbook — safe to re-run (every write
 * below is an upsert, see lib/db.ts). Personne rows with no matching
 * EmploiType or no matching live Neos employee are still imported (matricule
 * is the natural key here, not a Neos id) but come back in the report for
 * RH to sort out by hand, same pattern as PersonnelImportPanel: nothing is
 * silently guessed at. RattachementManager is deliberately left untouched —
 * this source file carries no Responsable/manager column at all, so every
 * imported Personne starts "manager non affecté" for RH to assign. */
export async function importGpecReferentiels(
  tenantId: number,
  buf: Buffer,
  employes: Employe[]
): Promise<GpecImportReport> {
  const parsed = parseGpecReferentiels(buf);

  for (const niv of parsed.echelleNiveaux) {
    await setGpecEchelleNiveau(tenantId, niv.niveau, niv.libelle, niv.definition);
  }

  const familleByNom = new Map<string, GpecFamille>();
  let familleOrdre = 0;
  for (const nom of new Set(parsed.emplois.map((e) => e.familleNom))) {
    familleByNom.set(nom, await getOrCreateGpecFamille(tenantId, nom, familleOrdre++));
  }

  const emploiTypeByNom = new Map<string, GpecEmploiType>();
  for (const e of parsed.emplois) {
    const famille = familleByNom.get(e.familleNom);
    if (!famille) continue;
    emploiTypeByNom.set(
      e.emploiTypeNom,
      await getOrCreateGpecEmploiType(tenantId, famille.id, e.emploiTypeNom, e.ordre, e.effectifReference)
    );
  }

  const socleByNom = new Map<string, GpecCompetenceSocle>();
  for (const soc of parsed.competenceSocles) {
    socleByNom.set(soc.nom, await getOrCreateGpecCompetenceSocle(tenantId, soc.nom, soc));
  }

  let competencesImportees = 0;
  for (const c of parsed.competences) {
    const emploiType = emploiTypeByNom.get(c.emploiTypeNom);
    if (!emploiType) continue;
    const socle = c.competenceSocleNom ? socleByNom.get(c.competenceSocleNom) ?? null : null;
    await getOrCreateGpecCompetence(tenantId, {
      emploiTypeId: emploiType.id,
      categorie: c.categorie,
      libelle: c.libelle,
      niveauRequis: c.niveauRequis,
      competenceSocleId: socle?.id ?? null,
    });
    competencesImportees++;
  }

  let personnesImportees = 0;
  const personnesNonRattacheesEmploiType: { matricule: string; nom: string; prenoms: string }[] = [];
  const personnesNonMatcheesNeos: { matricule: string; nom: string; prenoms: string; entite: string }[] = [];
  for (const p of parsed.personnes) {
    const emploiType = emploiTypeByNom.get(p.emploiTypeNom) ?? null;
    if (!emploiType) {
      personnesNonRattacheesEmploiType.push({ matricule: p.matricule, nom: p.nom, prenoms: p.prenoms });
    }
    const matched = matchPersonneToEmploye(p, employes);
    if (!matched) {
      personnesNonMatcheesNeos.push({ matricule: p.matricule, nom: p.nom, prenoms: p.prenoms, entite: p.entite });
    }
    await upsertGpecPersonneByMatricule(tenantId, {
      matricule: p.matricule,
      nom: p.nom,
      prenoms: p.prenoms,
      entite: p.entite,
      fonctionContrat: p.fonctionContrat,
      emploiTypeId: emploiType?.id ?? null,
      actif: true,
      employeId: matched?.id ?? null,
      email: matched?.email ?? null,
    });
    personnesImportees++;
  }

  return {
    familles: familleByNom.size,
    emploiTypes: emploiTypeByNom.size,
    competenceSocles: socleByNom.size,
    competences: competencesImportees,
    personnesImportees,
    personnesNonRattacheesEmploiType,
    personnesNonMatcheesNeos,
  };
}

// ---------------------------------------------------------------------------
// Ouverture de campagne — génération des lignes Evaluation vides
// ---------------------------------------------------------------------------

export interface GpecGenerationReport {
  lignesCreees: number;
  personnesSansEmploiType: { matricule: string; nom: string; prenoms: string }[];
}

/** "Personne sans emploi-type rattaché : ne doit pas pouvoir entrer en
 * campagne d'évaluation" — those are skipped here (reported back, not
 * blocking the whole campagne) rather than generating orphan lines. One row
 * per (personne actif × compétence de son emploi-type). */
export async function generateGpecCampagneEvaluations(
  tenantId: number,
  campagneId: string
): Promise<GpecGenerationReport> {
  const personnes = (await listGpecPersonnes(tenantId)).filter((p) => p.actif);
  const personnesSansEmploiType: { matricule: string; nom: string; prenoms: string }[] = [];
  const competencesCache = new Map<string, Awaited<ReturnType<typeof listGpecCompetencesForEmploiType>>>();
  const pairs: { personneId: string; competenceId: string }[] = [];

  for (const p of personnes) {
    if (!p.emploiTypeId) {
      personnesSansEmploiType.push({ matricule: p.matricule, nom: p.nom, prenoms: p.prenoms });
      continue;
    }
    let competences = competencesCache.get(p.emploiTypeId);
    if (!competences) {
      competences = await listGpecCompetencesForEmploiType(tenantId, p.emploiTypeId);
      competencesCache.set(p.emploiTypeId, competences);
    }
    for (const c of competences) pairs.push({ personneId: p.id, competenceId: c.id });
  }

  const lignesCreees = await generateGpecEvaluations(tenantId, campagneId, pairs);
  return { lignesCreees, personnesSansEmploiType };
}

// ---------------------------------------------------------------------------
// Suivi de complétion (Module 2) — RH uniquement pour cette phase
// ---------------------------------------------------------------------------

export interface GpecCompletionStats {
  total: number;
  autoRempli: number;
  managerRempli: number;
  retenuRempli: number;
  alertes: number;
}

export function computeGpecCompletionStats(evaluations: GpecEvaluation[]): GpecCompletionStats {
  let autoRempli = 0;
  let managerRempli = 0;
  let retenuRempli = 0;
  let alertes = 0;
  for (const e of evaluations) {
    if (e.niveauAuto != null) autoRempli++;
    if (e.niveauManager != null) managerRempli++;
    if (e.niveauRetenu != null) retenuRempli++;
    if (isGpecAlerte(gpecEcart(e.niveauAuto, e.niveauManager))) alertes++;
  }
  return { total: evaluations.length, autoRempli, managerRempli, retenuRempli, alertes };
}
