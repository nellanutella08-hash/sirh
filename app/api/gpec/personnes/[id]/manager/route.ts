import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isGpecAdmin } from "@/lib/gpec";
import { setGpecManager, setGpecPersonneEmploiType } from "@/lib/db";

/** RH réattribuant un collaborateur à un autre manager (via
 * gpec_rattachement_manager, jamais le champ "Responsable" des contrats —
 * voir §6) et/ou à un autre emploi-type. Either field may be omitted to
 * leave it untouched. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/gpec/personnes/[id]/manager">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isGpecAdmin(session.roles)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json();

  let personne = null;
  if ("managerId" in body) {
    personne = await setGpecManager(session.tenantId, id, body.managerId ?? null);
  }
  if ("emploiTypeId" in body) {
    personne = await setGpecPersonneEmploiType(session.tenantId, id, body.emploiTypeId ?? null);
  }
  if (!personne) return NextResponse.json({ error: "Personne introuvable" }, { status: 404 });
  return NextResponse.json(personne);
}
