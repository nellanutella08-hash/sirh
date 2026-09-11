import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listCandidates, createCandidate, CACHE_ENABLED } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) return NextResponse.json([]);

  const candidates = await listCandidates(session.tenantId);
  return NextResponse.json(candidates);
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
  if (!body?.fullname || !body?.poste) {
    return NextResponse.json({ error: "Nom et poste requis" }, { status: 400 });
  }

  const candidate = await createCandidate(session.tenantId, {
    fullname: String(body.fullname),
    poste: String(body.poste),
    email: body.email || null,
    telephone: body.telephone || null,
    source: body.source || null,
    notes: body.notes || null,
    cvPath: body.cvPath || null,
  });
  return NextResponse.json(candidate);
}
