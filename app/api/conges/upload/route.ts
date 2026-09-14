import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { uploadPrivateFile } from "@/lib/blob";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const employeIdRaw = form.get("employeId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  // A collaborateur can only ever upload a justificatif for their own
  // request — the employeId field is ignored for them (only RH's admin
  // board, submitting on behalf of someone else, actually needs it).
  const employeId = isRH(session) ? Number(employeIdRaw) : session.userId;
  if (!Number.isFinite(employeId)) {
    return NextResponse.json({ error: "Identifiant collaborateur invalide" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)" }, { status: 413 });
  }

  try {
    const result = await uploadPrivateFile("conges", employeId, file);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[conges upload]", err);
    return NextResponse.json({ error: "Échec de l'upload" }, { status: 502 });
  }
}
