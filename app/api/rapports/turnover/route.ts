import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { setTurnoverMensuel, CACHE_ENABLED } from "@/lib/db";

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const body = await req.json();
  const yearMonth = typeof body?.yearMonth === "string" ? body.yearMonth : null;
  const departs = Number(body?.departs);
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth) || !Number.isFinite(departs)) {
    return NextResponse.json({ error: "yearMonth et departs requis" }, { status: 400 });
  }
  const commentaire = typeof body?.commentaire === "string" ? body.commentaire : null;

  const updated = await setTurnoverMensuel(session.tenantId, yearMonth, { departs, commentaire });
  return NextResponse.json(updated);
}
