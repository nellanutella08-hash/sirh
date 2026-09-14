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
 * paperwork started right now. A missing end date shows the "CDI /
 * Indéterminé" label only for a genuine CDI — any other contract type
 * missing its end date has nothing to count down (so "ok", not a false
 * "CDI" label), verified against Neos's own active-contracts list to have
 * no bearing on whether the person counts as current staff (see
 * estEmployeActuel below — that's driven by the contract's isActive flag,
 * not its type). */
export function calcAlerte(contratType: string, dateFin: string | null): Alerte {
  if (!dateFin) return isCDI(contratType) ? "cdi" : "ok";
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

/** Whether someone counts as a current employee — verified directly
 * against Neos's own "active contracts" list (the same one RH reads off
 * in Neos), which turns out to depend on the contract's own `isActive`
 * flag, not its type or start date: a contract counts as current iff
 * `isActive === true` AND (no end date, or the end date hasn't passed
 * yet). Neither condition alone matches Neos's list — plenty of
 * non-CDI contracts have no end date on file and still count (isActive
 * carries them), and plenty of contracts stay flagged isActive after
 * their end date lapses without being renewed or closed out (dates alone
 * would wrongly carry those). */
export function estEmployeActuel(dateFin: string | null, contractIsActive: boolean): boolean {
  if (!contractIsActive) return false;
  if (!dateFin) return true;
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

export function isStagiaire(contratType: string): boolean {
  return /STAGE/i.test(contratType);
}

export function isConsultant(contratType: string): boolean {
  return /CONSULT/i.test(contratType);
}

function anneesAnciennete(dateEntree: string | null, at: Date): number {
  if (!dateEntree) return 0;
  const ms = at.getTime() - new Date(dateEntree).getTime();
  return ms / (365.25 * 86_400_000);
}

/** Whether someone is on approved leave right now (date-only comparison —
 * congé requests only ever carry a day, not a time of day). */
export function isEnConge(
  requests: { statut: string; dateDebut: string; dateFin: string }[],
  at: Date = new Date()
): boolean {
  const today = at.toISOString().slice(0, 10);
  return requests.some(
    (r) => r.statut === "validee" && r.dateDebut.slice(0, 10) <= today && today <= r.dateFin.slice(0, 10)
  );
}

/** Computes a contract holder's leave balance after one month's accrual —
 * called once per month by the accrual cron, folding the previous balance
 * in as `currentSolde`.
 * - Stagiaires never accrue leave: always 0.
 * - Consultants accrue 2.5j/month from their contract start date, and it
 *   doesn't carry into year N+1 (resets every January) — UNLESS they've
 *   passed 1 year of seniority, in which case they get a flat 30j instead
 *   of the monthly accrual.
 * - Everyone else (CDI/CDD) accrues 2.5j/month with no cap — RH seeds the
 *   starting balance manually, this only adds to it going forward. */
export function computeNextSolde(
  employe: { contratType: string; dateEntree: string | null },
  currentSolde: number,
  at: Date = new Date()
): number {
  if (isStagiaire(employe.contratType)) return 0;
  if (isConsultant(employe.contratType)) {
    if (anneesAnciennete(employe.dateEntree, at) >= 1) return 30;
    const base = at.getMonth() === 0 ? 0 : currentSolde;
    return Math.round((base + 2.5) * 10) / 10;
  }
  return Math.round((currentSolde + 2.5) * 10) / 10;
}
