// Pure, client-safe helpers shared by both server and client components.
// Must not import "server-only" or anything that pulls in Node/Neos code.

export type Alerte = "ok" | "attention" | "urgent" | "a_renouveler" | "expiré" | "cdi";

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/** Contract-expiry alert bucket. "a_renouveler" is its own category (not
 * lumped into "urgent"): a contract ending within 14 days needs renewal
 * paperwork started right now. */
export function calcAlerte(contratType: string, dateFin: string | null): Alerte {
  if (!dateFin || /CDI|IND[EÉ]TERMIN/i.test(contratType)) return "cdi";
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

/** Grace period, in days, past a contract's end date during which someone
 * still counts as a current employee (renewal paperwork lag). */
export const GRACE_DAYS = 14;

/** Whether someone counts as a current employee: CDI/indéterminé (no end
 * date), a contract that hasn't ended yet, or one that ended at most
 * GRACE_DAYS ago. Contracts expired longer than that are excluded — Neos
 * keeps records around after someone actually leaves. */
export function estEmployeActuel(contratType: string, dateFin: string | null): boolean {
  if (!dateFin || /CDI|IND[EÉ]TERMIN/i.test(contratType)) return true;
  return daysUntil(dateFin) >= -GRACE_DAYS;
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
