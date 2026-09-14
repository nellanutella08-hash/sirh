import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { getCongeSoldes, getCongeSolde, setCongeSolde, CACHE_ENABLED } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) return NextResponse.json(isRH(session) ? {} : { solde: 0 });

  if (isRH(session)) {
    const soldes = await getCongeSoldes(session.tenantId);
    const out: Record<number, { solde: number; updatedAt: string }> = {};
    for (const [employeId, s] of soldes) out[employeId] = { solde: s.solde, updatedAt: s.updatedAt };
    return NextResponse.json(out);
  }

  const own = await getCongeSolde(session.tenantId, session.userId);
  return NextResponse.json({ solde: own?.solde ?? 0 });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Interdit" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json(
      { error: "Base de données non configurée (DATABASE_URL manquant)" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const employeId = Number(body?.employeId);
  const solde = Number(body?.solde);
  if (!Number.isFinite(employeId) || !Number.isFinite(solde)) {
    return NextResponse.json({ error: "employeId et solde requis" }, { status: 400 });
  }

  const updated = await setCongeSolde(session.tenantId, employeId, solde);
  return NextResponse.json(updated);
}
