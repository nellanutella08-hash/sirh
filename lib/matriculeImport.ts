import "server-only";
import * as XLSX from "xlsx";
import type { Employe } from "@/lib/data";

/** One row of RH's "Liste employés" export from Neos's own UI — the only
 * source for the real personnel matricule (Neos's API doesn't expose it on
 * /api/users or /api/contracts, only the contract's own reference number,
 * which is a different real field — see lib/db.ts's employe_matricules
 * comment). */
export interface MatriculeRow {
  rowNumber: number;
  matricule: string;
  nom: string;
  prenoms: string;
  email: string | null;
}

function s(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

/** Reads by header name (Matricule/Nom/Prénoms/Email) rather than fixed
 * column position — this export's columns don't need to stay in a fixed
 * order for this to keep working. */
export function parseMatriculeBuffer(buf: Buffer): MatriculeRow[] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const rows: MatriculeRow[] = [];
  raw.forEach((r, i) => {
    const matricule = s(r["Matricule"]);
    const nom = s(r["Nom"]);
    const prenoms = s(r["Prénoms"]);
    if (!matricule || !nom || !prenoms) return;
    rows.push({ rowNumber: i + 2, matricule, nom, prenoms, email: s(r["Email"]) });
  });
  return rows;
}

function normalize(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface MatriculeMatchResult {
  row: MatriculeRow;
  employe: Employe | null;
  candidates: Employe[];
  confident: boolean;
}

/** Matches each row to a live Neos employee — by email first (this export
 * carries the same @synelia.tech address Neos itself uses as login, the
 * most reliable key available), falling back to exact normalized nom +
 * prénoms when the email doesn't match anyone (address typos/changes). */
export function matchMatriculeRows(rows: MatriculeRow[], employes: Employe[]): MatriculeMatchResult[] {
  const byEmail = new Map(employes.map((e) => [e.email.trim().toLowerCase(), e]));

  return rows.map((row) => {
    const emailKey = row.email?.trim().toLowerCase();
    const byEmailMatch = emailKey ? byEmail.get(emailKey) : undefined;
    if (byEmailMatch) {
      return { row, employe: byEmailMatch, candidates: [byEmailMatch], confident: true };
    }

    const nomN = normalize(row.nom);
    const prenomsN = normalize(row.prenoms);
    const exact = employes.filter((e) => normalize(e.nom) === nomN && normalize(e.prenoms) === prenomsN);
    if (exact.length === 1) {
      return { row, employe: exact[0], candidates: exact, confident: true };
    }
    return { row, employe: null, candidates: exact, confident: false };
  });
}
