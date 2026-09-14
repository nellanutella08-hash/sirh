import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { readPrivateFile } from "@/lib/blob";
import {
  listDocumentRequestsForEmploye,
  listCongeRequestsForEmploye,
  listCongeRequestsManagedBy,
} from "@/lib/db";

/** Shared download endpoint for any private Blob file this app manages
 * (congé justificatifs, candidate CVs, document requests, …) — gated
 * behind the app's own Neos-backed session rather than being a guessable
 * public Blob URL. A collaborateur (non-HR) may only download a file
 * attached to one of their own document/congé requests, or (as a manager)
 * a justificatif on a request awaiting their own avis; everything else
 * (candidate CVs, …) stays HR-only for now. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const pathname = req.nextUrl.searchParams.get("path");
  if (!pathname) return NextResponse.json({ error: "Paramètre path manquant" }, { status: 400 });

  if (!isRH(session)) {
    const [ownDocRequests, ownCongeRequests, managedCongeRequests] = await Promise.all([
      listDocumentRequestsForEmploye(session.tenantId, session.userId),
      listCongeRequestsForEmploye(session.tenantId, session.userId),
      listCongeRequestsManagedBy(session.tenantId, session.userId),
    ]);
    const owns =
      ownDocRequests.some((r) => r.filePath === pathname) ||
      ownCongeRequests.some((r) => r.justificatifPath === pathname) ||
      managedCongeRequests.some((r) => r.justificatifPath === pathname);
    if (!owns) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

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
