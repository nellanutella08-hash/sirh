import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { setPersonnelAffectation, CACHE_ENABLED } from "@/lib/db";

// Catégorie/régie/pôle technique-support/classification/type de projet —
// staffing data RH tracks in a spreadsheet outside Neos entirely (see
// lib/personnelImport.ts for the bulk import), editable per person here.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/personnel/[id]/affectation">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const employeId = Number(id);
  if (!Number.isFinite(employeId)) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }

  const body = await req.json();
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const classification =
    body?.classification === "regie" || body?.classification === "hors_regie"
      ? body.classification
      : null;

  const updated = await setPersonnelAffectation(session.tenantId, employeId, {
    categorie: str(body?.categorie),
    regie: str(body?.regie),
    poleTechSupport: str(body?.poleTechSupport),
    classification,
    typeProjet: str(body?.typeProjet),
  });

  return NextResponse.json(updated);
}
