import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { listEvaluations, createEvaluation, CACHE_ENABLED } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) return NextResponse.json([]);

  const evaluations = await listEvaluations(session.tenantId);
  return NextResponse.json(evaluations);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json(
      { error: "Base de données non configurée (DATABASE_URL manquant)" },
      { status: 503 }
    );
  }

  const body = await req.json();
  if (!body?.employeId || !body?.employeNom || !body?.periode) {
    return NextResponse.json({ error: "Collaborateur et période requis" }, { status: 400 });
  }

  const evaluation = await createEvaluation(session.tenantId, {
    employeId: Number(body.employeId),
    employeNom: String(body.employeNom),
    periode: String(body.periode),
    evaluateur: body.evaluateur || session.fullname,
    objectifs: Array.isArray(body.objectifs) ? body.objectifs : [],
  });
  return NextResponse.json(evaluation);
}
