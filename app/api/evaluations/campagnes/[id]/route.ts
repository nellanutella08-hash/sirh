import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { setCampagneStatut, CACHE_ENABLED, CAMPAGNE_STATUTS } from "@/lib/db";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/evaluations/campagnes/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });

  const { id } = await ctx.params;
  const body = await req.json();
  if (!CAMPAGNE_STATUTS.includes(body?.statut)) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }
  const campagne = await setCampagneStatut(session.tenantId, id, body.statut);
  if (!campagne) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  return NextResponse.json(campagne);
}
