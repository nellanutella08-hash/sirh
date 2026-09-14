import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { getDocumentRequest, updateDocumentRequest, deleteDocumentRequest, CACHE_ENABLED } from "@/lib/db";
import { sendDocumentReadyNotification } from "@/lib/zimbra";
import { getEmployes } from "@/lib/data";
import { NeosAuthError } from "@/lib/neos";
import { readPrivateFile } from "@/lib/blob";

// Managing a request (changing its status, deleting it) is an HR action —
// a collaborateur can create/view their own but not edit or remove them.

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/documents/requests/[id]">
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const current = await getDocumentRequest(session.tenantId, id);
  if (!current) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

  const patch = await req.json();
  const request = await updateDocumentRequest(session.tenantId, id, patch);
  if (!request) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

  // The file just got attached (whichever route did it — the automated
  // "Envoyer" button or a manual "+ Joindre" upload) — tell the employee,
  // joining the actual file to the email rather than just a download link.
  if (request.filePath && !current.filePath && request.statut === "prete") {
    try {
      const employes = await getEmployes(session);
      const employe = employes.find((e) => e.id === request.employeId);
      if (employe?.email) {
        let attachment: { filename: string; contentType: string; data: Buffer } | undefined;
        try {
          const file = await readPrivateFile(request.filePath);
          if (file && file.statusCode === 200) {
            const ext = request.filePath.split(".").pop() || "pdf";
            attachment = {
              filename: `${request.typeDocument}.${ext}`.replace(/[^a-zA-Z0-9._ -]/g, "_"),
              contentType: file.blob.contentType || "application/octet-stream",
              data: Buffer.from(await new Response(file.stream).arrayBuffer()),
            };
          }
        } catch (err) {
          console.error("[documents] failed to read file for email attachment", err);
        }
        await sendDocumentReadyNotification({
          employeEmail: employe.email,
          employeNom: request.employeNom,
          typeDocument: request.typeDocument,
          attachment,
        });
      }
    } catch (err) {
      if (!(err instanceof NeosAuthError)) console.error("[documents] ready notification failed", err);
    }
  }

  return NextResponse.json(request);
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/documents/requests/[id]">
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  await deleteDocumentRequest(session.tenantId, id);
  return NextResponse.json({ ok: true });
}
