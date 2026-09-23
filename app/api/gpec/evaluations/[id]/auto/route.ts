import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGpecPersonneByEmployeId, submitGpecNiveauAuto } from "@/lib/db";

/** Collaborateur saisissant son propre niveau_auto — scoped to their own
 * personne_id and to an 'ouverte' campagne directly in the SQL (see
 * submitGpecNiveauAuto), so there's nothing else to authorize here. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/gpec/evaluations/[id]/auto">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const personne = await getGpecPersonneByEmployeId(session.tenantId, session.userId);
  if (!personne) return NextResponse.json({ error: "Aucune fiche GPEC pour ce compte" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json();
  const niveauAuto = Number(body?.niveauAuto);
  if (![1, 2, 3, 4].includes(niveauAuto)) {
    return NextResponse.json({ error: "Niveau invalide (1 à 4 attendu)" }, { status: 400 });
  }

  const evaluation = await submitGpecNiveauAuto(session.tenantId, id, personne.id, niveauAuto);
  if (!evaluation) {
    return NextResponse.json(
      { error: "Évaluation introuvable, non rattachée à ce compte, ou campagne non ouverte" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
