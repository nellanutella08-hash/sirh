import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { getEmployes } from "@/lib/data";
import { setEmployeMatricule, CACHE_ENABLED } from "@/lib/db";
import { parseMatriculeBuffer, matchMatriculeRows } from "@/lib/matriculeImport";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/** Import of RH's "Liste employés" export from Neos's own UI — the only
 * source for the real personnel matricule (Neos's API exposes no such field
 * on /api/users or /api/contracts). Matched primarily by email, falling
 * back to name; anything else comes back in the report for RH to sort out
 * by hand rather than being guessed at, same pattern as
 * lib/personnelImport.ts. */
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
    rows = parseMatriculeBuffer(buf);
  } catch (err) {
    console.error("[matricule import] failed to parse file", err);
    return NextResponse.json(
      { error: "Fichier illisible — vérifiez que c'est bien l'export \"Liste employés\" de Neos (.xlsx)" },
      { status: 400 }
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "Aucune ligne trouvée dans le fichier" }, { status: 400 });
  }

  const employes = await getEmployes(session);
  const matches = matchMatriculeRows(rows, employes);

  let imported = 0;
  const ambiguous: { row: number; nom: string; prenoms: string; candidats: string[] }[] = [];
  const unmatched: { row: number; nom: string; prenoms: string }[] = [];

  for (const m of matches) {
    if (m.confident && m.employe) {
      await setEmployeMatricule(session.tenantId, m.employe.id, m.row.matricule);
      imported++;
    } else if (m.candidates.length > 0) {
      ambiguous.push({
        row: m.row.rowNumber,
        nom: m.row.nom,
        prenoms: m.row.prenoms,
        candidats: m.candidates.map((c) => `${c.fullname} (${c.entite}, ${c.fonction})`),
      });
    } else {
      unmatched.push({ row: m.row.rowNumber, nom: m.row.nom, prenoms: m.row.prenoms });
    }
  }

  return NextResponse.json({ totalRows: rows.length, imported, ambiguous, unmatched });
}
