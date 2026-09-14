import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { getEmployes } from "@/lib/data";
import { getCongeSoldes, setCongeSolde, CACHE_ENABLED } from "@/lib/db";
import { isConsultant, simulateInitialConsultantSolde } from "@/lib/format";

// One-time (or occasional) backfill: seeds a starting balance for every
// consultant RH hasn't manually entered one for yet, by replaying the
// monthly accrual rule (see simulateInitialConsultantSolde) from each
// consultant's contract start date up to today — never touches anyone who
// already has a conge_soldes row (manually seeded or otherwise).
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json(
      { error: "Base de données non configurée (DATABASE_URL manquant)" },
      { status: 503 }
    );
  }

  const employes = await getEmployes(session);
  const existing = await getCongeSoldes(session.tenantId);
  const now = new Date();

  const applied: { employeId: number; fullname: string; solde: number }[] = [];
  const skipped: { employeId: number; fullname: string }[] = [];

  for (const e of employes) {
    if (!isConsultant(e.contratType) || existing.has(e.id)) continue;
    const solde = simulateInitialConsultantSolde(e, now);
    if (solde == null) {
      skipped.push({ employeId: e.id, fullname: e.fullname });
      continue;
    }
    await setCongeSolde(session.tenantId, e.id, solde);
    applied.push({ employeId: e.id, fullname: e.fullname, solde });
  }

  return NextResponse.json({ applied, skipped });
}
