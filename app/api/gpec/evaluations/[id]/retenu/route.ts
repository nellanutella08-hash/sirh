import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGpecPersonneByEmployeId, setGpecNiveauRetenu } from "@/lib/db";

/** Manager validant niveau_retenu après discussion avec le collaborateur —
 * séparé de la saisie de niveau_manager pour pouvoir revenir dessus plus
 * tard (notamment après une alerte), sans jamais le déduire automatiquement
 * d'une moyenne des deux niveaux. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/gpec/evaluations/[id]/retenu">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const manager = await getGpecPersonneByEmployeId(session.tenantId, session.userId);
  if (!manager) return NextResponse.json({ error: "Aucune fiche GPEC pour ce compte" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json();
  const niveauRetenu = Number(body?.niveauRetenu);
  if (![1, 2, 3, 4].includes(niveauRetenu)) {
    return NextResponse.json({ error: "Niveau invalide (1 à 4 attendu)" }, { status: 400 });
  }
  const commentaire = typeof body?.commentaire === "string" ? body.commentaire : null;

  const evaluation = await setGpecNiveauRetenu(session.tenantId, id, manager.id, niveauRetenu, commentaire);
  if (!evaluation) {
    return NextResponse.json({ error: "Évaluation introuvable ou personne hors périmètre" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
