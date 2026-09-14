import { NextRequest, NextResponse } from "next/server";
import { listCachedTenantIds, readEmployesCache, applyMonthlyAccrual } from "@/lib/db";
import type { Employe } from "@/lib/data";

/** Runs monthly (see vercel.json) to accrue congé balances — see
 * computeNextSolde in lib/format.ts for the actual rules. There is no
 * logged-in RH session to pull a fresh employe list from Neos with, so
 * this reads whatever the ordinary hourly employes_cache already holds for
 * each tenant instead of calling Neos itself. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantIds = await listCachedTenantIds();
  const results = [];
  for (const tenantId of tenantIds) {
    const cached = await readEmployesCache(tenantId);
    if (!cached) continue;
    const employes = cached.payload as Employe[];
    const result = await applyMonthlyAccrual(tenantId, employes);
    results.push({ tenantId, employes: employes.length, ...result });
  }
  return NextResponse.json({ ok: true, results });
}
