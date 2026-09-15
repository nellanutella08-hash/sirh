import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import {
  getEvaluation,
  setEvaluationObjectifs,
  assignerEvaluation,
  submitAutoEval,
  submitNotation,
  deleteEvaluation,
  CACHE_ENABLED,
  type ObjectifLigne,
  type NiveauAtteinte,
  NIVEAU_ATTEINTE,
} from "@/lib/db";

function isNiveau(v: unknown): v is NiveauAtteinte {
  return v === null || (typeof v === "string" && (NIVEAU_ATTEINTE as readonly string[]).includes(v));
}

/** Every action here is scoped to one fiche already in the DB, so authz is
 * a direct comparison against that fiche's own responsable_id/employe_id —
 * no need to re-derive manager/report relationships from Neos each time. */
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/evaluations/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const evaluation = await getEvaluation(session.tenantId, id);
  if (!evaluation) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });

  const rh = isRH(session);
  const isResponsable = rh || session.userId === evaluation.responsableId;
  const isTitulaire = session.userId === evaluation.employeId;

  const body = await req.json();
  const action = body?.action;

  if (action === "objectifs" || action === "assigner") {
    if (!isResponsable) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    if (action === "objectifs") {
      const objectifsIn = Array.isArray(body.objectifs) ? body.objectifs : [];
      const objectifs: ObjectifLigne[] = objectifsIn.map(
        (o: Partial<ObjectifLigne>, i: number): ObjectifLigne => ({
          id: typeof o.id === "string" && o.id ? o.id : crypto.randomUUID(),
          numero: i + 1,
          categorie: String(o.categorie ?? ""),
          objectif: String(o.objectif ?? ""),
          livrables: String(o.livrables ?? ""),
          indicateur: String(o.indicateur ?? ""),
          echeance: String(o.echeance ?? ""),
          points: Number(o.points) || 0,
          autoNiveau: null,
          autoCommentaire: null,
          managerNiveau: null,
          managerCommentaire: null,
        })
      );
      const updated = await setEvaluationObjectifs(session.tenantId, id, {
        poste: String(body.poste ?? evaluation.poste),
        departement: String(body.departement ?? evaluation.departement),
        objectifs,
      });
      if (!updated) {
        return NextResponse.json(
          { error: "Fiche déjà assignée — les objectifs ne sont plus modifiables" },
          { status: 409 }
        );
      }
      return NextResponse.json(updated);
    }

    // action === "assigner"
    const total = evaluation.objectifs.reduce((s, o) => s + o.points, 0);
    if (evaluation.objectifs.length === 0 || total !== 100) {
      return NextResponse.json(
        { error: `Le total des points doit être égal à 100 (actuellement ${total})` },
        { status: 400 }
      );
    }
    const updated = await assignerEvaluation(session.tenantId, id);
    if (!updated) return NextResponse.json({ error: "Fiche déjà assignée" }, { status: 409 });
    return NextResponse.json(updated);
  }

  if (action === "auto_eval") {
    if (!isTitulaire) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const patch = Array.isArray(body.objectifs) ? body.objectifs : [];
    for (const p of patch) {
      if (!isNiveau(p?.autoNiveau)) {
        return NextResponse.json({ error: "Niveau d'auto-évaluation invalide" }, { status: 400 });
      }
    }
    const updated = await submitAutoEval(
      session.tenantId,
      id,
      patch.map((p: { id: string; autoNiveau: NiveauAtteinte | null; autoCommentaire: string | null }) => ({
        id: p.id,
        autoNiveau: p.autoNiveau,
        autoCommentaire: p.autoCommentaire || null,
      }))
    );
    if (!updated) return NextResponse.json({ error: "Fiche non assignée" }, { status: 409 });
    return NextResponse.json(updated);
  }

  if (action === "notation") {
    if (!isResponsable) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const patch = Array.isArray(body.objectifs) ? body.objectifs : [];
    for (const p of patch) {
      if (!isNiveau(p?.managerNiveau)) {
        return NextResponse.json({ error: "Niveau de notation invalide" }, { status: 400 });
      }
    }
    const updated = await submitNotation(session.tenantId, id, {
      objectifs: patch.map(
        (p: { id: string; managerNiveau: NiveauAtteinte | null; managerCommentaire: string | null }) => ({
          id: p.id,
          managerNiveau: p.managerNiveau,
          managerCommentaire: p.managerCommentaire || null,
        })
      ),
      commentaireManager: body.commentaireManager || null,
    });
    if (!updated) return NextResponse.json({ error: "Fiche pas encore assignée" }, { status: 409 });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/evaluations/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const evaluation = await getEvaluation(session.tenantId, id);
  if (!evaluation) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
  if (!isRH(session) && session.userId !== evaluation.responsableId) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const deleted = await deleteEvaluation(session.tenantId, id);
  if (!deleted) {
    return NextResponse.json(
      { error: "Seule une fiche en brouillon peut être supprimée" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
