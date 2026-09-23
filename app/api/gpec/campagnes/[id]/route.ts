import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isGpecAdmin } from "@/lib/gpec";
import { setGpecCampagneStatut, GPEC_CAMPAGNE_STATUTS } from "@/lib/db";

/** RH clôture (ou rouvre) une campagne. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/gpec/campagnes/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isGpecAdmin(session.roles)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json();
  const statut = body?.statut;
  if (!GPEC_CAMPAGNE_STATUTS.includes(statut)) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }

  const campagne = await setGpecCampagneStatut(session.tenantId, id, statut);
  if (!campagne) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  return NextResponse.json(campagne);
}
