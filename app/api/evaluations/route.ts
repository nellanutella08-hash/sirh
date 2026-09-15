import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { requireEmploye } from "@/lib/data";
import { createEvaluation, listEvaluations, CACHE_ENABLED } from "@/lib/db";
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

/** Creates a brouillon fiche d'objectifs for one employee. Allowed for RH
 * (on behalf of anyone), or for a manager creating a fiche for one of their
 * own direct reports (per Neos's managerId — checked against the live
 * employe record, not trusted from the request body). */
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
  const employeId = Number(body?.employeId);
  const annee = String(body?.annee ?? "").trim();
  if (!employeId || !annee) {
    return NextResponse.json({ error: "Collaborateur et année requis" }, { status: 400 });
  }

  let employe;
  try {
    employe = await requireEmploye(session, employeId);
  } catch (err) {
    if (err instanceof NeosAuthError) {
      return NextResponse.json({ error: "Session Neos expirée" }, { status: 401 });
    }
    throw err;
  }
  if (!employe) return NextResponse.json({ error: "Collaborateur introuvable" }, { status: 404 });

  const rh = isRH(session);
  if (!rh && employe.managerId !== session.userId) {
    return NextResponse.json(
      { error: "Vous n'êtes le manager (Neos) de ce collaborateur" },
      { status: 403 }
    );
  }

  const evaluation = await createEvaluation(session.tenantId, {
    employeId: employe.id,
    employeNom: employe.fullname,
    poste: employe.fonction,
    departement: employe.entite,
    responsableId: employe.managerId ?? session.userId,
    responsableNom: employe.managerNom ?? session.fullname,
    annee,
  });
  return NextResponse.json(evaluation);
}
