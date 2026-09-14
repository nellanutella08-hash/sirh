import "server-only";
import * as XLSX from "xlsx";
import type { Employe } from "@/lib/data";
import type { PersonnelAffectation } from "@/lib/db";

/** One row of the "fichier consolidé du personnel" RH maintains outside
 * Neos (staffing/régie assignment, not something Neos tracks at all). */
export interface ConsolideRow {
  rowNumber: number;
  entite: string;
  nom: string;
  prenoms: string;
  typeProjet: string | null;
  categorie: string | null;
  regie: string | null;
  poleTechSupport: string | null;
  classificationRaw: string | null;
}

function s(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

/** Reads the first sheet of the workbook (RH's consolidated file always
 * has the most recent month first, e.g. "SEPTEMBRE 2026") and extracts the
 * columns this import cares about: Entité (B), Nom (C), Prénoms (D), Type
 * de projet (G), Catégorie (J), RÉGIES (K), TECH/SUPPORT (L),
 * Classification (M). */
export function parseConsolideBuffer(buf: Buffer): ConsolideRow[] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: ConsolideRow[] = [];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");

  const cell = (r: number, c: number): unknown => {
    const addr = XLSX.utils.encode_cell({ r, c });
    return sheet[addr]?.v;
  };

  // Row 0 is the header; data starts at row 1 (XLSX rows are 0-indexed here).
  for (let r = 1; r <= range.e.r; r++) {
    const nom = s(cell(r, 2)); // C
    if (!nom) continue;
    rows.push({
      rowNumber: r + 1,
      entite: s(cell(r, 1)) ?? "", // B
      nom,
      prenoms: s(cell(r, 3)) ?? "", // D
      typeProjet: s(cell(r, 6)), // G
      categorie: s(cell(r, 9)), // J
      regie: s(cell(r, 10)), // K
      poleTechSupport: s(cell(r, 11)), // L
      classificationRaw: s(cell(r, 12)), // M
    });
  }
  return rows;
}

/** Business rules RH gave for resolving these columns into one record:
 * - régie: column K (current) wins over J whenever both are filled — J is
 *   the older/less reliable catch-all, kept separately as "categorie" only
 *   for reference.
 * - classification: forced to "regie" the moment K names a régie, even if
 *   M still says "HORS REGIE" (K is the more current column). Otherwise
 *   read off M — collapsed to just regie/hors_regie (SUPPORT ADM/
 *   DIRECTION/SG all count as hors_regie, per RH's choice), null when M is
 *   blank too and there's truly no signal either way. */
export function resolveAffectation(
  row: ConsolideRow
): Omit<PersonnelAffectation, "employeId" | "updatedAt"> {
  const regie = row.regie;
  let classification: "regie" | "hors_regie" | null = null;
  if (regie) {
    classification = "regie";
  } else if (row.classificationRaw) {
    classification = /REGIE/i.test(row.classificationRaw) && !/HORS/i.test(row.classificationRaw)
      ? "regie"
      : "hors_regie";
  }

  return {
    categorie: row.categorie,
    regie,
    poleTechSupport: row.poleTechSupport,
    classification,
    typeProjet: row.typeProjet,
  };
}

function normalize(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface MatchResult {
  row: ConsolideRow;
  employe: Employe | null;
  candidates: Employe[]; // when ambiguous (>1) or a loose/uncertain match
  confident: boolean;
}

/** Matches each spreadsheet row to a live Neos employee by name — the
 * file carries no Neos id/matricule at all, just Nom/Prénoms/Entité. Exact
 * normalized nom+prénoms match, disambiguated by entité when there's more
 * than one same-name employee; anything else is reported back as
 * ambiguous/unmatched rather than guessed at. */
export function matchRows(rows: ConsolideRow[], employes: Employe[]): MatchResult[] {
  return rows.map((row) => {
    const nomN = normalize(row.nom);
    const prenomsN = normalize(row.prenoms);
    const entiteN = normalize(row.entite);

    const exact = employes.filter(
      (e) => normalize(e.nom) === nomN && normalize(e.prenoms) === prenomsN
    );

    if (exact.length === 1) {
      return { row, employe: exact[0], candidates: exact, confident: true };
    }
    if (exact.length > 1) {
      const byEntite = exact.filter((e) => normalize(e.entite).includes(entiteN) || entiteN.includes(normalize(e.entite)));
      if (byEntite.length === 1) {
        return { row, employe: byEntite[0], candidates: exact, confident: true };
      }
      return { row, employe: null, candidates: exact, confident: false };
    }

    // No exact match — try a looser fallback (nom exact, prénoms one
    // contains the other) purely to surface likely candidates for RH to
    // confirm; never auto-applied.
    const loose = employes.filter((e) => {
      if (normalize(e.nom) !== nomN) return false;
      const ep = normalize(e.prenoms);
      return ep.includes(prenomsN) || prenomsN.includes(ep);
    });
    return { row, employe: null, candidates: loose, confident: false };
  });
}
