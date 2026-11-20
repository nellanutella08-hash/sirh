import "server-only";
import { redirect } from "next/navigation";
import type { NeosSession } from "./neos";

/** Neos roles that grant full HR/admin access to this app. Everyone else
 * (plain ROLE_USER, or any other non-HR role) gets the collaborateur
 * self-service view instead — see app/(app)/layout.tsx. */
const HR_ROLES = new Set(["ROLE_RH", "ROLE_SUPER_ADMIN", "ROLE_SG"]);

export function isRH(session: NeosSession): boolean {
  return session.roles.some((r) => HR_ROLES.has(r));
}

/** Stakeholders who track a roadmap item (e.g. VA32) against the live
 * /dashboard but aren't RH and shouldn't get the rest of the HR app
 * (Personnel, Masse salariale, Contrats…) — a narrow, named allow-list
 * rather than a new Neos role, since this is a one-off per person, not a
 * general access tier. Keyed by Neos email, lower-cased. */
const DASHBOARD_VIEWERS = new Set(["seynabou.diagne@synelia.tech"]);

export function canViewDashboard(session: NeosSession): boolean {
  return isRH(session) || DASHBOARD_VIEWERS.has(session.email.toLowerCase());
}

/** Guards an HR-only page: sends non-HR sessions to their own space instead
 * of letting them view everyone's salaries, contracts, personal data, etc. */
export function requireRH(session: NeosSession): void {
  if (!isRH(session)) redirect("/mon-tableau-de-bord");
}

/** Guards /dashboard specifically: RH, plus the narrow DASHBOARD_VIEWERS
 * allow-list above — everyone else still goes to their own space. */
export function requireDashboardAccess(session: NeosSession): void {
  if (!canViewDashboard(session)) redirect("/mon-tableau-de-bord");
}
