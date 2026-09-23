import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGpecPersonneByEmployeId, submitGpecNiveauManager } from "@/lib/db";

/** Manager saisissant niveau_manager (+ éventuellement commentaire/
 * niveau_retenu dans le même geste, si sa saisie ne déclenche pas d'alerte —
 * voir GpecEquipeBoard) pour une personne de son périmètre. La vérification
 * "cette personne m'est bien rattachée via RattachementManager" est faite
 * directement dans la requête SQL (submitGpecNiveauManager), jamais via le
 * champ "Responsable" des contrats. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/gpec/evaluations/[id]/manager">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const manager = await getGpecPersonneByEmployeId(session.tenantId, session.userId);
  if (!manager) return NextResponse.json({ error: "Aucune fiche GPEC pour ce compte" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json();
  const niveauManager = Number(body?.niveauManager);
  if (![1, 2, 3, 4].includes(niveauManager)) {
    return NextResponse.json({ error: "Niveau invalide (1 à 4 attendu)" }, { status: 400 });
  }
  const commentaire = typeof body?.commentaire === "string" ? body.commentaire : null;
  const niveauRetenuRaw = body?.niveauRetenu;
  const niveauRetenu = [1, 2, 3, 4].includes(Number(niveauRetenuRaw)) ? Number(niveauRetenuRaw) : null;

  const evaluation = await submitGpecNiveauManager(session.tenantId, id, manager.id, {
    niveauManager,
    commentaire,
    niveauRetenu,
  });
  if (!evaluation) {
    return NextResponse.json(
      { error: "Évaluation introuvable, personne hors périmètre, ou campagne non ouverte" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
