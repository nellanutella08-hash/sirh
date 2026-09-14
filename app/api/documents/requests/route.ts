import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import {
  listDocumentRequests,
  listDocumentRequestsForEmploye,
  createDocumentRequest,
  CACHE_ENABLED,
} from "@/lib/db";
import { sendNotificationEmail } from "@/lib/zimbra";

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

  // RH staff are employees too and use this same endpoint from their own
  // self-service space (no employeId in the body — see MyDocumentsBoard),
  // in addition to filing requests for others from the admin board (which
  // does send employeId/employeNom). A collaborateur can never request a
  // document for someone else — any employeId/employeNom they submit is
  // ignored and replaced with their own identity.
  const targetsSelf = !rh || !body?.employeId;
  const employeId = targetsSelf ? session.userId : Number(body.employeId);
  const employeNom = targetsSelf ? session.fullname : String(body?.employeNom ?? "");

  if (!employeId || !employeNom || !body?.typeDocument) {
    return NextResponse.json({ error: "Collaborateur et type de document requis" }, { status: 400 });
  }

  const request = await createDocumentRequest(session.tenantId, {
    employeId,
    employeNom,
    typeDocument: String(body.typeDocument),
    commentaire: body.commentaire || null,
  });

  // Notify HR whenever the request targets the requester themselves —
  // including RH staff requesting their own documents, since the rest of
  // the team still needs to know to process it. Skip only when RH files a
  // request on behalf of someone else from the admin board: they already
  // know, since they just did it.
  if (targetsSelf) {
    await sendNotificationEmail(
      `[SIRH] Nouvelle demande de document — ${employeNom}`,
      `${employeNom} vient de soumettre une demande de document via le SIRH.\n\n` +
        `Type de document : ${request.typeDocument}\n` +
        `Commentaire : ${request.commentaire || "—"}\n\n` +
        `Voir dans le SIRH : Demandes de documents.`
    );
  }

  return NextResponse.json(request);
}
