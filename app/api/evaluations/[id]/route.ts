import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { requireEmploye } from "@/lib/data";
import { sendFicheObjectifsConfirmee } from "@/lib/zimbra";
import { renderFicheObjectifsPdf } from "@/lib/ficheObjectifsPdf";
import {
  getEvaluation,
  setEvaluationContenu,
  confirmerEvaluation,
  setObjectifStatutSuivi,
  submitAutoEval,
  submitNotation,
  deleteEvaluation,
  CACHE_ENABLED,
  STATUT_SUIVI,
  type ObjectifLigne,
  type SoftSkillLigne,
} from "@/lib/db";

function totalPonderation(objectifs: { ponderation: number }[], softSkills: { ponderation: number }[]): number {
  const total = [...objectifs, ...softSkills].reduce((s, l) => s + (Number(l.ponderation) || 0), 0);
  return Math.round(total * 10) / 10;
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

  if (action === "contenu") {
    if (!isResponsable) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const objectifsIn = Array.isArray(body.objectifs) ? body.objectifs : [];
    const softSkillsIn = Array.isArray(body.softSkills) ? body.softSkills : [];
    const objectifs: ObjectifLigne[] = objectifsIn.map(
      (o: Partial<ObjectifLigne>, i: number): ObjectifLigne => ({
        id: typeof o.id === "string" && o.id ? o.id : crypto.randomUUID(),
        numero: i + 1,
        axe: String(o.axe ?? ""),
        objectif: String(o.objectif ?? ""),
        livrables: String(o.livrables ?? ""),
        kpi: String(o.kpi ?? ""),
        cible: String(o.cible ?? ""),
        echeance: String(o.echeance ?? ""),
        ponderation: Number(o.ponderation) || 0,
        statutSuivi: STATUT_SUIVI.includes(o.statutSuivi as never) ? (o.statutSuivi as ObjectifLigne["statutSuivi"]) : "non_demarre",
        autoScoreAtteint: null,
        autoCommentaire: null,
        scoreAtteint: null,
        managerCommentaire: null,
      })
    );
    const softSkills: SoftSkillLigne[] = softSkillsIn.map(
      (s: Partial<SoftSkillLigne>): SoftSkillLigne => ({
        id: typeof s.id === "string" && s.id ? s.id : crypto.randomUUID(),
        critereId: s.critereId ?? null,
        libelle: String(s.libelle ?? ""),
        description: String(s.description ?? ""),
        niveauAttendu: s.niveauAttendu ?? "autonome",
        ponderation: Number(s.ponderation) || 0,
        autoScoreAtteint: null,
        autoCommentaire: null,
        scoreAtteint: null,
        managerCommentaire: null,
      })
    );
    const updated = await setEvaluationContenu(session.tenantId, id, {
      poste: String(body.poste ?? evaluation.poste),
      departement: String(body.departement ?? evaluation.departement),
      objectifs,
      softSkills,
    });
    if (!updated) {
      return NextResponse.json({ error: "Fiche déjà confirmée — le contenu n'est plus modifiable" }, { status: 409 });
    }
    return NextResponse.json(updated);
  }

  if (action === "confirmer") {
    if (!isResponsable) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const total = totalPonderation(evaluation.objectifs, evaluation.softSkills);
    if (evaluation.objectifs.length === 0 || Math.abs(total - 100) > 0.5) {
      return NextResponse.json(
        { error: `La pondération totale (objectifs + soft skills) doit être égale à 100% (actuellement ${total}%)` },
        { status: 400 }
      );
    }
    const updated = await confirmerEvaluation(session.tenantId, id);
    if (!updated) return NextResponse.json({ error: "Fiche déjà confirmée" }, { status: 409 });

    try {
      const employe = await requireEmploye(session, updated.employeId);
      if (employe?.email) {
        const pdf = renderFicheObjectifsPdf({
          employeNom: updated.employeNom,
          employePrenom: employe.prenoms || undefined,
          poste: updated.poste,
          departement: updated.departement,
          responsableNom: updated.responsableNom,
          annee: updated.annee,
          objectifs: updated.objectifs.map((o) => ({
            numero: o.numero,
            axe: o.axe,
            objectif: o.objectif,
            livrables: o.livrables,
            kpi: o.kpi,
            cible: o.cible,
            echeance: o.echeance,
          })),
          softSkills: updated.softSkills.map((s) => ({
            libelle: s.libelle,
            description: s.description,
            niveauAttendu: s.niveauAttendu,
          })),
        });
        await sendFicheObjectifsConfirmee({
          employeEmail: employe.email,
          employePrenom: employe.prenoms || employe.fullname,
          annee: updated.annee,
          responsableNom: updated.responsableNom,
          objectifsLibelles: updated.objectifs.map((o) => o.objectif).filter(Boolean),
          pdf,
          estTest: updated.estTest,
        });
      }
    } catch (err) {
      console.error("[evaluations] échec de l'envoi de la confirmation par mail", err);
    }
    return NextResponse.json(updated);
  }

  if (action === "statut_suivi") {
    if (!isResponsable) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const objectifId = String(body.objectifId ?? "");
    const statutSuivi = body.statutSuivi;
    if (!STATUT_SUIVI.includes(statutSuivi)) {
      return NextResponse.json({ error: "Statut de suivi invalide" }, { status: 400 });
    }
    const updated = await setObjectifStatutSuivi(session.tenantId, id, objectifId, statutSuivi);
    if (!updated) return NextResponse.json({ error: "Fiche encore en brouillon" }, { status: 409 });
    return NextResponse.json(updated);
  }

  if (action === "auto_eval") {
    if (!isTitulaire) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const objectifs = Array.isArray(body.objectifs) ? body.objectifs : [];
    const softSkills = Array.isArray(body.softSkills) ? body.softSkills : [];
    const updated = await submitAutoEval(session.tenantId, id, {
      objectifs: objectifs.map((o: { id: string; autoScoreAtteint: number | null; autoCommentaire: string | null }) => ({
        id: o.id,
        autoScoreAtteint: o.autoScoreAtteint == null ? null : Number(o.autoScoreAtteint),
        autoCommentaire: o.autoCommentaire || null,
      })),
      softSkills: softSkills.map((s: { id: string; autoScoreAtteint: number | null; autoCommentaire: string | null }) => ({
        id: s.id,
        autoScoreAtteint: s.autoScoreAtteint == null ? null : Number(s.autoScoreAtteint),
        autoCommentaire: s.autoCommentaire || null,
      })),
    });
    if (!updated) {
      return NextResponse.json(
        { error: "Auto-évaluation impossible : aucune campagne d'évaluation ouverte pour cette fiche" },
        { status: 409 }
      );
    }
    return NextResponse.json(updated);
  }

  if (action === "notation") {
    if (!isResponsable) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const objectifs = Array.isArray(body.objectifs) ? body.objectifs : [];
    const softSkills = Array.isArray(body.softSkills) ? body.softSkills : [];
    const updated = await submitNotation(session.tenantId, id, {
      objectifs: objectifs.map((o: { id: string; scoreAtteint: number | null; managerCommentaire: string | null }) => ({
        id: o.id,
        scoreAtteint: o.scoreAtteint == null ? null : Number(o.scoreAtteint),
        managerCommentaire: o.managerCommentaire || null,
      })),
      softSkills: softSkills.map((s: { id: string; scoreAtteint: number | null; managerCommentaire: string | null }) => ({
        id: s.id,
        scoreAtteint: s.scoreAtteint == null ? null : Number(s.scoreAtteint),
        managerCommentaire: s.managerCommentaire || null,
      })),
      commentaireManager: body.commentaireManager || null,
    });
    if (!updated) {
      return NextResponse.json(
        { error: "Notation impossible : aucune campagne d'évaluation ouverte pour cette fiche" },
        { status: 409 }
      );
    }
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
    return NextResponse.json({ error: "Seule une fiche en brouillon peut être supprimée" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
