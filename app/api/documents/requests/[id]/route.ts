import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { updateDocumentRequest, deleteDocumentRequest, CACHE_ENABLED } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/documents/requests/[id]">
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const patch = await req.json();
  const request = await updateDocumentRequest(session.tenantId, id, patch);
  if (!request) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  return NextResponse.json(request);
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/documents/requests/[id]">
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  await deleteDocumentRequest(session.tenantId, id);
  return NextResponse.json({ ok: true });
}
