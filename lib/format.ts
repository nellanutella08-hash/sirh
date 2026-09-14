// Pure, client-safe helpers shared by both server and client components.
// Must not import "server-only" or anything that pulls in Node/Neos code.

export type Alerte = "ok" | "attention" | "urgent" | "a_renouveler" | "expiré" | "cdi";

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function isCDI(contratType: string): boolean {
  return /CDI|IND[EÉ]TERMIN/i.test(contratType);
}

/** Contract-expiry alert bucket. "a_renouveler" is its own category (not
 * lumped into "urgent"): a contract ending within 14 days needs renewal
 * paperwork started right now. A missing end date only means "no expiry
 * to track" for a genuine CDI — for any other contract type it's a data
 * gap (the contract should have an end date but doesn't), not a signal
 * that the person is permanent. */
export function calcAlerte(contratType: string, dateFin: string | null): Alerte {
  if (!dateFin) return isCDI(contratType) ? "cdi" : "expiré";
  const j = daysUntil(dateFin);
  if (j < 0) return "expiré";
  if (j <= 14) return "a_renouveler";
  if (j <= 30) return "urgent";
  if (j <= 90) return "attention";
  return "ok";
}

export function joursRestants(dateFin: string | null): number | null {
  if (!dateFin) return null;
  return daysUntil(dateFin);
}

/** Whether someone counts as a current employee: CDI/indéterminé (no end
 * date), or a contract that hasn't ended yet (end date today or later).
 * Once a contract's end date is in the past, that person no longer counts
 * toward effectif — Neos keeps the record around, this app doesn't treat
 * it as active staff. (Contracts ending within 14 days still count, and
 * are separately flagged via the "a_renouveler" alert badge above.)
 *
 * A missing end date on its own is NOT treated as "must be CDI, therefore
 * current" — plenty of non-CDI contracts (consultance, stage…) are simply
 * missing their end date in Neos and shouldn't be counted as active staff
 * on that basis alone. Only a genuine CDI gets that pass. */
export function estEmployeActuel(contratType: string, dateFin: string | null): boolean {
  if (!dateFin) return isCDI(contratType);
  return daysUntil(dateFin) >= 0;
}

export function fmtFCFA(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("fr-FR");
}

export function initials(fullname: string): string {
  const parts = fullname.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
