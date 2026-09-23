import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isGpecAdmin, generateGpecCampagneEvaluations } from "@/lib/gpec";
import { createGpecCampagne, CACHE_ENABLED } from "@/lib/db";

/** RH ouvre une campagne : création + génération automatique des lignes
 * Evaluation vides pour chaque (personne actif × compétence de son
 * emploi-type) — §5 du cahier des charges. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isGpecAdmin(session.roles)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const body = await req.json();
  const nom = typeof body?.nom === "string" ? body.nom.trim() : "";
  const dateDebut = typeof body?.dateDebut === "string" ? body.dateDebut : "";
  const dateFin = typeof body?.dateFin === "string" ? body.dateFin : "";
  if (!nom || !dateDebut || !dateFin) {
    return NextResponse.json({ error: "Nom et dates requis" }, { status: 400 });
  }

  const campagne = await createGpecCampagne(session.tenantId, { nom, dateDebut, dateFin });
  const generation = await generateGpecCampagneEvaluations(session.tenantId, campagne.id);

  return NextResponse.json({ campagne, generation });
}
