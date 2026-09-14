import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { setManagerOverride, deleteManagerOverride } from "@/lib/db";

/** Manual correction of an employe's manager (see lib/data.ts's
 * applyManagerOverrides) — Neos exposes a `manager` field but it's
 * sometimes missing or wrong, and RH has no way to fix it in Neos itself
 * from here. RH-only: this affects congé-request approval routing. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/personnel/[id]/manager">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await ctx.params;
  const employeId = Number(id);
  if (!Number.isFinite(employeId)) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }

  const body = await req.json();
  const managerId = body?.managerId != null ? Number(body.managerId) : null;
  const managerNom = typeof body?.managerNom === "string" ? body.managerNom : null;

  if (managerId === null) {
    // Explicit "revert to Neos" action rather than "set manager to null" —
    // there's no such thing as an override that says "no manager".
    await deleteManagerOverride(session.tenantId, employeId);
  } else {
    await setManagerOverride(session.tenantId, employeId, managerId, managerNom);
  }

  return NextResponse.json({ ok: true });
}
