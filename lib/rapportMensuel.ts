import "server-only";
import type { Employe } from "@/lib/data";
import type { CongeRequest, TurnoverMensuel, PersonnelAffectation } from "@/lib/db";
import { getPersonnelAffectations, listCongeRequests, getTurnoverMensuels, CACHE_ENABLED } from "@/lib/db";
import { fetchPipelineRows, GoogleSheetError, type PipelineRow } from "@/lib/googleSheets";

export interface RapportMensuel {
  yearMonth: string;
  label: string;
  effectifs: {
    total: number;
    parEntite: [string, number][];
    parPole: [string, number][];
    parContrat: [string, number][];
  };
  recrutements: {
    total: number;
    liste: { fullname: string; poste: string; date: string }[];
  };
  absenteisme: {
    joursTotal: number;
    parEntite: [string, number][];
    tauxPct: number | null;
  };
  turnover: {
    departs: number | null;
    commentaire: string | null;
    tauxPct: number | null;
  };
}

function monthBounds(yearMonth: string): { start: Date; end: Date; joursOuvres: number } {
  const [y, m] = yearMonth.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0)); // last day of month
  let joursOuvres = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) joursOuvres++;
  }
  return { start, end, joursOuvres };
}

function countBy(rows: string[]): [string, number][] {
  const out: Record<string, number> = {};
  for (const v of rows) out[v || "—"] = (out[v || "—"] ?? 0) + 1;
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

/** Builds the "Tableau de bord RH Groupe" monthly report — effectifs and
 * répartition are always the *current* snapshot (Neos has no historical
 * roster to reconstruct a past month's headcount from), while recrutements
 * and absentéisme are genuinely computed for the requested month from data
 * that does carry real dates. Turnover has no data source of its own at
 * all (see turnover_mensuel in lib/db.ts) — RH enters/imports it by hand,
 * this just reads whatever's there for that month. */
export function buildRapportMensuel(params: {
  yearMonth: string;
  employes: Employe[];
  affectations: Record<number, Pick<PersonnelAffectation, "poleTechSupport">>;
  pipeline: PipelineRow[];
  congeRequests: CongeRequest[];
  turnover: TurnoverMensuel | null;
}): RapportMensuel {
  const { yearMonth, employes, affectations, pipeline, congeRequests, turnover } = params;
  const { start, end, joursOuvres } = monthBounds(yearMonth);
  const label = start.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

  const parEntite = countBy(employes.map((e) => e.entite));
  const parContrat = countBy(employes.map((e) => e.contratType));
  const parPole = countBy(employes.map((e) => affectations[e.id]?.poleTechSupport ?? "Non renseigné"));

  // Recrutements du mois — désormais lu en direct depuis le pipeline Google
  // Sheets d'Ornella (colonne "Contrat signé" = Oui, "Date début du
  // contrat" dans le mois) plutôt que depuis une saisie manuelle locale.
  const embauches = pipeline.filter((p) => {
    if (!p.contratSigne || !p.dateDebutContrat) return false;
    const d = new Date(p.dateDebutContrat);
    return d >= start && d <= new Date(end.getTime() + 86_400_000 - 1);
  });

  let joursTotal = 0;
  const joursParEntite: Record<string, number> = {};
  const entiteByEmploye = new Map(employes.map((e) => [e.id, e.entite]));
  for (const r of congeRequests) {
    if (r.statut !== "validee") continue;
    const rDebut = new Date(r.dateDebut);
    const rFin = new Date(r.dateFin);
    const overlapStart = rDebut > start ? rDebut : start;
    const overlapEnd = rFin < end ? rFin : end;
    if (overlapStart > overlapEnd) continue;
    const jours = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86_400_000) + 1;
    joursTotal += jours;
    const entite = entiteByEmploye.get(r.employeId) ?? "—";
    joursParEntite[entite] = (joursParEntite[entite] ?? 0) + jours;
  }
  const tauxAbsenteisme =
    employes.length > 0 && joursOuvres > 0
      ? Math.round((joursTotal / (employes.length * joursOuvres)) * 1000) / 10
      : null;

  const tauxTurnover =
    turnover && employes.length > 0
      ? Math.round((turnover.departs / employes.length) * 1000) / 10
      : null;

  return {
    yearMonth,
    label,
    effectifs: {
      total: employes.length,
      parEntite,
      parPole,
      parContrat,
    },
    recrutements: {
      total: embauches.length,
      liste: embauches.map((p) => ({ fullname: p.candidat, poste: p.poste, date: p.dateDebutContrat ?? "" })),
    },
    absenteisme: {
      joursTotal,
      parEntite: Object.entries(joursParEntite).sort((a, b) => b[1] - a[1]),
      tauxPct: tauxAbsenteisme,
    },
    turnover: {
      departs: turnover?.departs ?? null,
      commentaire: turnover?.commentaire ?? null,
      tauxPct: tauxTurnover,
    },
  };
}

export function defaultYearMonth(): string {
  const now = new Date();
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Shared by the report page and both export routes: fetches the pure-DB
 * data this report needs (no Neos call — callers already have `employes`
 * from whichever employe-fetch fits their context, page vs API route) and
 * builds the report. */
export async function fetchRapportMensuel(
  tenantId: number,
  employes: Employe[],
  yearMonth: string
): Promise<RapportMensuel> {
  const [affectationsMap, congeRequests, turnoverMap] = CACHE_ENABLED
    ? await Promise.all([getPersonnelAffectations(tenantId), listCongeRequests(tenantId), getTurnoverMensuels(tenantId)])
    : [new Map<number, PersonnelAffectation>(), [], new Map<string, TurnoverMensuel>()];

  // Le pipeline vit sur Google Sheets, hors de notre contrôle — une panne de
  // partage/réseau ne doit pas faire échouer tout le rapport mensuel, juste
  // vider la section recrutements de ce rapport-là.
  const pipeline = await fetchPipelineRows().catch((err) => {
    if (err instanceof GoogleSheetError) return [];
    throw err;
  });

  const affectations: Record<number, { poleTechSupport: string | null }> = {};
  for (const [employeId, a] of affectationsMap) {
    affectations[employeId] = { poleTechSupport: a.poleTechSupport };
  }

  return buildRapportMensuel({
    yearMonth,
    employes,
    affectations,
    pipeline,
    congeRequests,
    turnover: turnoverMap.get(yearMonth) ?? null,
  });
}
