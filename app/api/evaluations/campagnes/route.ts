import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { listCampagnes, createCampagne, CACHE_ENABLED } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) return NextResponse.json([]);

  const campagnes = await listCampagnes(session.tenantId);
  return NextResponse.json(campagnes);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const body = await req.json();
  if (!body?.nom || !body?.annee) {
    return NextResponse.json({ error: "Nom et année requis" }, { status: 400 });
  }
  const entites = Array.isArray(body.entites) ? body.entites.map(String) : [];

  const campagne = await createCampagne(session.tenantId, { nom: String(body.nom), annee: String(body.annee), entites });
  return NextResponse.json(campagne);
}
