import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { updateCongeRequest, deleteCongeRequest, CACHE_ENABLED } from "@/lib/db";

// Managing a request (avis hiérarchie, visa RH, deletion) is an HR action —
// a collaborateur can create/view their own but not edit or remove them.

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/conges/requests/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const patch = await req.json();
  const request = await updateCongeRequest(session.tenantId, id, patch);
  if (!request) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  return NextResponse.json(request);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/conges/requests/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  await deleteCongeRequest(session.tenantId, id);
  return NextResponse.json({ ok: true });
}
