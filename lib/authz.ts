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

/** Guards an HR-only page: sends non-HR sessions to their own space instead
 * of letting them view everyone's salaries, contracts, personal data, etc. */
export function requireRH(session: NeosSession): void {
  if (!isRH(session)) redirect("/mes-documents");
}
