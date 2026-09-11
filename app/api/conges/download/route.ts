import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { readJustificatif } from "@/lib/blob";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const pathname = req.nextUrl.searchParams.get("path");
  if (!pathname) return NextResponse.json({ error: "Paramètre path manquant" }, { status: 400 });

  const result = await readJustificatif(pathname);
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Content-Disposition": result.blob.contentDisposition,
    },
  });
}
