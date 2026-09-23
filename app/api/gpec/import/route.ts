import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isGpecAdmin, importGpecReferentiels } from "@/lib/gpec";
import { getEmployes } from "@/lib/data";
import { CACHE_ENABLED } from "@/lib/db";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** One-time (or occasional) import of GPEC_Synelia_Referentiels.xlsx —
 * populates Famille/EmploiType/CompetenceSocle/Competence/EchelleNiveau/
 * Personne. Safe to re-run: every write is an upsert (see lib/gpec.ts). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isGpecAdmin(session.roles)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json(
      { error: "Base de données non configurée (DATABASE_URL manquant)" },
      { status: 503 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)" }, { status: 413 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const employes = await getEmployes(session);
    const report = await importGpecReferentiels(session.tenantId, buf, employes);
    return NextResponse.json(report);
  } catch (err) {
    console.error("[gpec import] failed", err);
    const message = err instanceof Error ? err.message : "Fichier illisible";
    return NextResponse.json(
      { error: `Import impossible — ${message}` },
      { status: 400 }
    );
  }
}
