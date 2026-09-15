import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { requireEmploye } from "@/lib/data";
import { createEvaluations, listEvaluations, CACHE_ENABLED, type NouvelleFicheObjectifs } from "@/lib/db";
import { NeosAuthError } from "@/lib/neos";

/** RH-only consolidated listing (à la vue "Consolidé" du modèle) — managers
 * and employees get their own scoped data straight from the server
 * components that render their pages, not through this route. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) return NextResponse.json([]);

  const evaluations = await listEvaluations(session.tenantId);
  return NextResponse.json(evaluations);
}

/** Creates one brouillon fiche per employé in `employeIds`, all seeded from
 * the same objectifs/soft-skills template — this is how a "fiche transverse"
 * shared by several collaborateurs works (fill the template once, each
 * person gets an independent fiche to score). Allowed for RH (on behalf of
 * anyone), or for a manager creating fiches for their own direct reports
 * (per Neos's managerId — checked against the live employe record for each
 * target, not trusted from the request body). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) {
    return NextResponse.json(
      { error: "Base de données non configurée (DATABASE_URL manquant)" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const employeIds: number[] = Array.isArray(body?.employeIds)
    ? body.employeIds.map(Number).filter(Boolean)
    : [];
  const annee = String(body?.annee ?? "").trim();
  const objectifs: NouvelleFicheObjectifs["objectifs"] = Array.isArray(body?.objectifs) ? body.objectifs : [];
  const softSkills: NouvelleFicheObjectifs["softSkills"] = Array.isArray(body?.softSkills) ? body.softSkills : [];
  if (employeIds.length === 0 || !annee) {
    return NextResponse.json({ error: "Au moins un collaborateur et une année sont requis" }, { status: 400 });
  }

  const rh = isRH(session);
  const employes: { id: number; nom: string; poste: string; departement: string }[] = [];
  try {
    for (const employeId of employeIds) {
      const employe = await requireEmploye(session, employeId);
      if (!employe) {
        return NextResponse.json({ error: `Collaborateur ${employeId} introuvable` }, { status: 404 });
      }
      if (!rh && employe.managerId !== session.userId) {
        return NextResponse.json(
          { error: `Vous n'êtes pas le manager (Neos) de ${employe.fullname}` },
          { status: 403 }
        );
      }
      employes.push({ id: employe.id, nom: employe.fullname, poste: employe.fonction, departement: employe.entite });
    }
  } catch (err) {
    if (err instanceof NeosAuthError) {
      return NextResponse.json({ error: "Session Neos expirée" }, { status: 401 });
    }
    throw err;
  }

  const first = await requireEmploye(session, employeIds[0]);
  const responsableId = rh ? (first?.managerId ?? session.userId) : session.userId;
  const responsableNom = rh ? (first?.managerNom ?? session.fullname) : session.fullname;

  const evaluations = await createEvaluations(session.tenantId, employes, {
    responsableId,
    responsableNom,
    annee,
    objectifs: objectifs.map((o, i) => ({
      id: crypto.randomUUID(),
      numero: i + 1,
      axe: String(o.axe ?? ""),
      objectif: String(o.objectif ?? ""),
      livrables: String(o.livrables ?? ""),
      kpi: String(o.kpi ?? ""),
      cible: String(o.cible ?? ""),
      echeance: String(o.echeance ?? ""),
      ponderation: Number(o.ponderation) || 0,
      statutSuivi: "non_demarre",
    })),
    softSkills: softSkills.map((s) => ({
      id: crypto.randomUUID(),
      critereId: s.critereId ?? null,
      libelle: String(s.libelle ?? ""),
      description: String(s.description ?? ""),
      niveauAttendu: s.niveauAttendu ?? "autonome",
      ponderation: Number(s.ponderation) || 0,
    })),
  });
  return NextResponse.json(evaluations);
}
