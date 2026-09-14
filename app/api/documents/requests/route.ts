import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import {
  listDocumentRequests,
  listDocumentRequestsForEmploye,
  createDocumentRequest,
  CACHE_ENABLED,
} from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) return NextResponse.json([]);

  // RH sees every request; a collaborateur only ever sees their own.
  const requests = isRH(session)
    ? await listDocumentRequests(session.tenantId)
    : await listDocumentRequestsForEmploye(session.tenantId, session.userId);
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
  const rh = isRH(session);

  // A collaborateur can only ever request a document for themselves — the
  // employeId/employeNom in the request body are ignored for them and
  // replaced with their own identity, regardless of what was submitted.
  const employeId = rh ? Number(body?.employeId) : session.userId;
  const employeNom = rh ? String(body?.employeNom ?? "") : session.fullname;

  if (!employeId || !employeNom || !body?.typeDocument) {
    return NextResponse.json({ error: "Collaborateur et type de document requis" }, { status: 400 });
  }

  const request = await createDocumentRequest(session.tenantId, {
    employeId,
    employeNom,
    typeDocument: String(body.typeDocument),
    commentaire: body.commentaire || null,
  });
  return NextResponse.json(request);
}
