import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { getEmployes } from "@/lib/data";
import { setPersonnelAffectation, CACHE_ENABLED } from "@/lib/db";
import { parseConsolideBuffer, resolveAffectation, matchRows } from "@/lib/personnelImport";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// One-time (or occasional) import of RH's "fichier consolidé du
// personnel" — the only source for staffing data Neos doesn't track at
// all (régie, pôle technique/support, classification, type de projet).
// The file has no Neos id, just Nom/Prénoms/Entité, so every row is
// matched by name against the live Neos employee list; only confident
// matches get written, everything else comes back in the report for RH
// to sort out by hand rather than being silently guessed at.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
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

  let rows;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    rows = parseConsolideBuffer(buf);
  } catch (err) {
    console.error("[personnel import] failed to parse file", err);
    return NextResponse.json({ error: "Fichier illisible — vérifiez que c'est bien le fichier consolidé du personnel (.xlsx)" }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "Aucune ligne trouvée dans le fichier" }, { status: 400 });
  }

  const employes = await getEmployes(session);
  const matches = matchRows(rows, employes);

  let imported = 0;
  const ambiguous: { row: number; nom: string; prenoms: string; entite: string; candidats: string[] }[] = [];
  const unmatched: { row: number; nom: string; prenoms: string; entite: string; suggestions: string[] }[] = [];

  for (const m of matches) {
    if (m.confident && m.employe) {
      await setPersonnelAffectation(session.tenantId, m.employe.id, resolveAffectation(m.row));
      imported++;
    } else if (m.candidates.length > 0) {
      ambiguous.push({
        row: m.row.rowNumber,
        nom: m.row.nom,
        prenoms: m.row.prenoms,
        entite: m.row.entite,
        candidats: m.candidates.map((c) => `${c.fullname} (${c.entite}, ${c.fonction})`),
      });
    } else {
      unmatched.push({
        row: m.row.rowNumber,
        nom: m.row.nom,
        prenoms: m.row.prenoms,
        entite: m.row.entite,
        suggestions: [],
      });
    }
  }

  return NextResponse.json({
    totalRows: rows.length,
    imported,
    ambiguous,
    unmatched,
  });
}
