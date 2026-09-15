import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { updateCritereSoftSkill, deleteCritereSoftSkill, CACHE_ENABLED } from "@/lib/db";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/evaluations/criteres/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });

  const { id } = await ctx.params;
  const patch = await req.json();
  const critere = await updateCritereSoftSkill(session.tenantId, id, patch);
  if (!critere) return NextResponse.json({ error: "Critère introuvable" }, { status: 404 });
  return NextResponse.json(critere);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/evaluations/criteres/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });

  const { id } = await ctx.params;
  await deleteCritereSoftSkill(session.tenantId, id);
  return NextResponse.json({ ok: true });
}
