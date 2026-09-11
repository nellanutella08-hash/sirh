import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { uploadPrivateFile } from "@/lib/blob";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)" }, { status: 413 });
  }

  try {
    const result = await uploadPrivateFile("documents", session.tenantId, file);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[documents upload]", err);
    return NextResponse.json({ error: "Échec de l'upload" }, { status: 502 });
  }
}
