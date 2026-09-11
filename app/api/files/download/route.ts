import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { readPrivateFile } from "@/lib/blob";

/** Shared download endpoint for any private Blob file this app manages
 * (congé justificatifs, candidate CVs, …) — gated behind the app's own
 * Neos-backed session rather than being a guessable public Blob URL. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const pathname = req.nextUrl.searchParams.get("path");
  if (!pathname) return NextResponse.json({ error: "Paramètre path manquant" }, { status: 400 });

  const result = await readPrivateFile(pathname);
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
