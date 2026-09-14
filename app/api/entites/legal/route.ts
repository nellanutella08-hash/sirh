import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { getEntiteLegalInfos, setEntiteLegalInfo, CACHE_ENABLED } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  requireRH(session);
  if (!CACHE_ENABLED) return NextResponse.json({});

  const infos = await getEntiteLegalInfos(session.tenantId);
  const out: Record<number, unknown> = {};
  for (const [entiteId, info] of infos) out[entiteId] = info;
  return NextResponse.json(out);
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  requireRH(session);
  if (!CACHE_ENABLED) {
    return NextResponse.json(
      { error: "Base de données non configurée (DATABASE_URL manquant)" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const entiteId = Number(body?.entiteId);
  if (!Number.isFinite(entiteId)) {
    return NextResponse.json({ error: "entiteId requis" }, { status: 400 });
  }

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const updated = await setEntiteLegalInfo(session.tenantId, entiteId, {
    raisonSociale: str(body?.raisonSociale),
    formeJuridique: str(body?.formeJuridique),
    capitalFcfa: body?.capitalFcfa != null && body?.capitalFcfa !== "" ? Number(body.capitalFcfa) : null,
    capitalLettres: body?.capitalLettres ? str(body.capitalLettres) : null,
    siege: str(body?.siege),
    rccm: str(body?.rccm),
    compteContribuable: str(body?.compteContribuable),
    telephone: str(body?.telephone),
    representantCivilite: str(body?.representantCivilite) || "Monsieur",
    representantNom: str(body?.representantNom),
    representantTitre: str(body?.representantTitre),
    signataireTitre: str(body?.signataireTitre),
    villeSignature: str(body?.villeSignature) || "Abidjan",
    piedDePage: str(body?.piedDePage),
  });
  return NextResponse.json(updated);
}
