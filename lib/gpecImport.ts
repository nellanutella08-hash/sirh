import "server-only";
import * as XLSX from "xlsx";
import type { Employe } from "@/lib/data";
import type { GpecCompetenceCategorie } from "@/lib/db";

function s(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

function n(v: unknown): number | null {
  if (v == null || v === "") return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

export interface EchelleNiveauRow {
  niveau: number;
  libelle: string;
  definition: string;
}

export interface ReferentielEmploiRow {
  familleNom: string;
  emploiTypeNom: string;
  effectifReference: number | null;
  ordre: number;
}

export interface CompetenceSocleRow {
  nom: string;
  defNiveau1: string;
  defNiveau2: string;
  defNiveau3: string;
  defNiveau4: string;
}

export interface ReferentielCompetenceRow {
  familleNom: string;
  emploiTypeNom: string;
  categorie: GpecCompetenceCategorie;
  libelle: string;
  niveauRequis: number;
  competenceSocleNom: string | null;
}

export interface CartographiePersonneRow {
  matricule: string;
  nom: string;
  prenoms: string;
  entite: string;
  fonctionContrat: string;
  familleNom: string;
  emploiTypeNom: string;
}

export interface GpecReferentiels {
  echelleNiveaux: EchelleNiveauRow[];
  emplois: ReferentielEmploiRow[];
  competenceSocles: CompetenceSocleRow[];
  competences: ReferentielCompetenceRow[];
  personnes: CartographiePersonneRow[];
}

const CATEGORIES: readonly GpecCompetenceCategorie[] = ["Savoir", "Savoir-faire", "Savoir-être"];

/** Parses GPEC_Synelia_Referentiels.xlsx — one sheet per référentiel, all in
 * the same uploaded file. Column layouts are read by header name (robust to
 * column reordering) and matched against the real file's confirmed
 * structure:
 * - Référentiel_Emplois: the Famille column is forward-filled (blank = same
 *   famille as the row above); "Sous-total ..."/"TOTAL ..." rows are
 *   aggregates, not real emplois-types, and are dropped.
 * - Savoir-être_Comportemental: a trailing blank row + footnote row are
 *   dropped by requiring a non-empty nom.
 * - Cartographie_Personnes already carries Famille/Emploi-type prefilled for
 *   all 231 rows (the 61-intitulé→23-emploi-type mapping is already done in
 *   this file) — read directly, no re-derivation from Fonction needed. */
export function parseGpecReferentiels(buf: Buffer): GpecReferentiels {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });

  const sheetRows = (name: string): Record<string, unknown>[] => {
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`Onglet "${name}" introuvable dans le fichier`);
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  };

  const echelleNiveaux: EchelleNiveauRow[] = [];
  for (const r of sheetRows("Échelle_Niveaux")) {
    const niveau = n(r["Niveau"]);
    const libelle = s(r["Libellé"]);
    if (niveau == null || !libelle) continue;
    echelleNiveaux.push({ niveau, libelle, definition: s(r["Définition"]) ?? "" });
  }

  const emplois: ReferentielEmploiRow[] = [];
  {
    let currentFamille = "";
    let ordre = 0;
    for (const r of sheetRows("Référentiel_Emplois")) {
      const famille = s(r["Famille professionnelle"]);
      if (famille) currentFamille = famille;
      const emploiTypeNom = s(r["Emploi-type"]);
      if (!emploiTypeNom || /^(sous-total|total)\b/i.test(emploiTypeNom)) continue;
      const effectifKey = Object.keys(r).find((k) => k.toLowerCase().startsWith("effectif"));
      emplois.push({
        familleNom: currentFamille,
        emploiTypeNom,
        effectifReference: effectifKey ? n(r[effectifKey]) : null,
        ordre: ordre++,
      });
    }
  }

  const competenceSocles: CompetenceSocleRow[] = [];
  {
    const socleRows = sheetRows("Savoir-être_Comportemental");
    const keys = Object.keys(socleRows[0] ?? {});
    const k1 = keys.find((k) => k.includes("Niveau 1"));
    const k2 = keys.find((k) => k.includes("Niveau 2"));
    const k3 = keys.find((k) => k.includes("Niveau 3"));
    const k4 = keys.find((k) => k.includes("Niveau 4"));
    for (const r of socleRows) {
      const nom = s(r["Compétence socle (harmonisée)"]);
      const defNiveau1 = s(k1 ? r[k1] : null) ?? "";
      const defNiveau2 = s(k2 ? r[k2] : null) ?? "";
      if (!nom || (!defNiveau1 && !defNiveau2)) continue; // drops blank/footnote rows
      competenceSocles.push({
        nom,
        defNiveau1,
        defNiveau2,
        defNiveau3: s(k3 ? r[k3] : null) ?? "",
        defNiveau4: s(k4 ? r[k4] : null) ?? "",
      });
    }
  }

  const competences: ReferentielCompetenceRow[] = [];
  for (const r of sheetRows("Référentiel_Compétences")) {
    const familleNom = s(r["Famille"]);
    const emploiTypeNom = s(r["Emploi-type"]);
    const categorieRaw = s(r["Catégorie"]);
    const libelle = s(r["Compétence"]);
    const niveauRequis = n(r["Niveau requis (1-4)"]);
    if (!familleNom || !emploiTypeNom || !libelle || niveauRequis == null) continue;
    if (!categorieRaw || !CATEGORIES.includes(categorieRaw as GpecCompetenceCategorie)) continue;
    competences.push({
      familleNom,
      emploiTypeNom,
      categorie: categorieRaw as GpecCompetenceCategorie,
      libelle,
      niveauRequis,
      competenceSocleNom: s(r["Compétence socle (si Savoir-être)"]),
    });
  }

  const personnes: CartographiePersonneRow[] = [];
  for (const r of sheetRows("Cartographie_Personnes")) {
    const matricule = s(r["Matricule"]);
    const nom = s(r["Nom"]);
    const prenoms = s(r["Prénoms"]);
    if (!matricule || !nom || !prenoms) continue;
    personnes.push({
      matricule,
      nom,
      prenoms,
      entite: s(r["Entité"]) ?? "",
      fonctionContrat: s(r["Fonction (intitulé contrat)"]) ?? "",
      familleNom: s(r["Famille"]) ?? "",
      emploiTypeNom: s(r["Emploi-type"]) ?? "",
    });
  }

  return { echelleNiveaux, emplois, competenceSocles, competences, personnes };
}

function normalize(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Matches a Cartographie_Personnes row to a live Neos employee by name —
 * this source file has no Neos id either, just Nom/Prénoms/Entité (same
 * situation as lib/personnelImport.ts's consolidé file). Only used to
 * populate gpec_personne.employe_id/email so the matched person can log in
 * and see their own GPEC space; the GPEC import itself never depends on a
 * match (Personne is keyed by its own matricule, not by Neos id). */
export function matchPersonneToEmploye(row: CartographiePersonneRow, employes: Employe[]): Employe | null {
  const nomN = normalize(row.nom);
  const prenomsN = normalize(row.prenoms);
  const entiteN = normalize(row.entite);

  const exact = employes.filter((e) => normalize(e.nom) === nomN && normalize(e.prenoms) === prenomsN);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    const byEntite = exact.filter(
      (e) => normalize(e.entite).includes(entiteN) || entiteN.includes(normalize(e.entite))
    );
    return byEntite.length === 1 ? byEntite[0] : null;
  }
  return null;
}
