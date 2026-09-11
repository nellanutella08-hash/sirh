import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { updateEvaluation, deleteEvaluation, CACHE_ENABLED } from "@/lib/db";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/evaluations/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const patch = await req.json();
  const evaluation = await updateEvaluation(session.tenantId, id, patch);
  if (!evaluation) return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
  return NextResponse.json(evaluation);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/evaluations/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  await deleteEvaluation(session.tenantId, id);
  return NextResponse.json({ ok: true });
}
