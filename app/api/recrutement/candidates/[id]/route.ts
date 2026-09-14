import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { updateCandidate, deleteCandidate, CACHE_ENABLED } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/recrutement/candidates/[id]">
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const patch = await req.json();
  const candidate = await updateCandidate(session.tenantId, id, patch);
  if (!candidate) return NextResponse.json({ error: "Candidat introuvable" }, { status: 404 });
  return NextResponse.json(candidate);
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/recrutement/candidates/[id]">
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  await deleteCandidate(session.tenantId, id);
  return NextResponse.json({ ok: true });
}
