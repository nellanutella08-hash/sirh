import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listDocumentRequests, createDocumentRequest, CACHE_ENABLED } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) return NextResponse.json([]);

  const requests = await listDocumentRequests(session.tenantId);
  return NextResponse.json(requests);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) {
    return NextResponse.json(
      { error: "Base de données non configurée (DATABASE_URL manquant)" },
      { status: 503 }
    );
  }

  const body = await req.json();
  if (!body?.employeId || !body?.employeNom || !body?.typeDocument) {
    return NextResponse.json({ error: "Collaborateur et type de document requis" }, { status: 400 });
  }

  const request = await createDocumentRequest(session.tenantId, {
    employeId: Number(body.employeId),
    employeNom: String(body.employeNom),
    typeDocument: String(body.typeDocument),
    commentaire: body.commentaire || null,
  });
  return NextResponse.json(request);
}
