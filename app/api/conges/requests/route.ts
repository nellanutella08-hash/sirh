import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import {
  listCongeRequests,
  listCongeRequestsForEmploye,
  createCongeRequest,
  CONGE_DEDUCTIONS,
  CACHE_ENABLED,
  type CongeDeduction,
} from "@/lib/db";
import { sendCongeRequestNotification } from "@/lib/zimbra";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) return NextResponse.json([]);

  // RH sees every request; a collaborateur only ever sees their own.
  const requests = isRH(session)
    ? await listCongeRequests(session.tenantId)
    : await listCongeRequestsForEmploye(session.tenantId, session.userId);
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

  // Same self-vs-someone-else split as /api/documents/requests: RH staff
  // are employees too and file their own leave requests from the same
  // self-service form (no employeId in the body), in addition to entering
  // a request on behalf of someone else from the admin board.
  const targetsSelf = !rh || !body?.employeId;
  const employeId = targetsSelf ? session.userId : Number(body.employeId);
  const employeNom = targetsSelf ? session.fullname : String(body?.employeNom ?? "");

  const motif = typeof body?.motif === "string" ? body.motif.trim() : "";
  const motifDetail =
    typeof body?.motifDetail === "string" && body.motifDetail.trim() ? body.motifDetail.trim() : null;
  const dateDebut = typeof body?.dateDebut === "string" ? body.dateDebut : "";
  const dateFin = typeof body?.dateFin === "string" ? body.dateFin : "";
  const jours = Number(body?.jours);
  const dateReprise = typeof body?.dateReprise === "string" && body.dateReprise ? body.dateReprise : null;
  const deduction: CongeDeduction = CONGE_DEDUCTIONS.includes(body?.deduction)
    ? body.deduction
    : "conges_annuels";
  const contactUrgenceNom =
    typeof body?.contactUrgenceNom === "string" && body.contactUrgenceNom ? body.contactUrgenceNom : null;
  const contactUrgenceLien =
    typeof body?.contactUrgenceLien === "string" && body.contactUrgenceLien ? body.contactUrgenceLien : null;
  const contactUrgenceNumero =
    typeof body?.contactUrgenceNumero === "string" && body.contactUrgenceNumero
      ? body.contactUrgenceNumero
      : null;
  const interimaires =
    typeof body?.interimaires === "string" && body.interimaires ? body.interimaires : null;

  if (!employeId || !employeNom || !motif || !dateDebut || !dateFin || !(jours > 0)) {
    return NextResponse.json(
      { error: "Collaborateur, motif et dates de l'absence sont requis" },
      { status: 400 }
    );
  }

  const request = await createCongeRequest(session.tenantId, {
    employeId,
    employeNom,
    motif,
    motifDetail,
    dateDebut,
    dateFin,
    jours,
    dateReprise,
    deduction,
    contactUrgenceNom,
    contactUrgenceLien,
    contactUrgenceNumero,
    interimaires,
  });

  // Same notification rule as document requests: notify HR whenever the
  // request targets the requester's own leave, skip when RH enters one on
  // behalf of someone else (they already know, since they just did it).
  if (targetsSelf) {
    await sendCongeRequestNotification({ employeNom, motif, motifDetail, dateDebut, dateFin, jours });
  }

  return NextResponse.json(request);
}
