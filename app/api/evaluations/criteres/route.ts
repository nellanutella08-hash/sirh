import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { listCriteresSoftSkills, createCritereSoftSkill, CACHE_ENABLED } from "@/lib/db";

/** Any authenticated user can read the référentiel — managers need it to
 * pick soft-skill criteria while building a fiche — but only RH curates it. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) return NextResponse.json([]);

  const criteres = await listCriteresSoftSkills(session.tenantId);
  return NextResponse.json(criteres);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const body = await req.json();
  if (!body?.libelle) return NextResponse.json({ error: "Libellé requis" }, { status: 400 });

  const critere = await createCritereSoftSkill(session.tenantId, {
    libelle: String(body.libelle),
    description: String(body.description ?? ""),
    profil: String(body.profil ?? "tous"),
  });
  return NextResponse.json(critere);
}
