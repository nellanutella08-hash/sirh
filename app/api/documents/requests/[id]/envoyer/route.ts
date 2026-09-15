import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { getDocumentRequest, getEntiteLegalInfo, updateDocumentRequest, CACHE_ENABLED } from "@/lib/db";
import { getEmployes, getEnterprise } from "@/lib/data";
import { renderDocumentPdf } from "@/lib/documentPdf";
import { uploadPrivateBuffer } from "@/lib/blob";
import { sendDocumentReadyNotification } from "@/lib/zimbra";

// One-click "Envoyer" from the generation page: builds the PDF straight
// from the request's data (no client-side rendering/upload round trip),
// attaches it to the request, and emails it to the collaborator with the
// PDF attached — the automated counterpart to the manual print → sign/
// tamponner → scan → "+ Joindre" flow, for the "numérique" mode where the
// letter is already fully signed/stamped digitally.
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/documents/requests/[id]/envoyer">
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  // Optional — présent quand RH a utilisé "Modifier" sur la page de
  // génération : le texte affiché à l'écran (édité) prime alors sur celui
  // recalculé depuis le modèle, pour que le PDF envoyé corresponde
  // exactement à ce qui a été relu.
  const body = await req.json().catch(() => null);
  const override: { title: string; paragraphs: string[] } | undefined =
    body?.title && Array.isArray(body?.paragraphs)
      ? { title: String(body.title), paragraphs: body.paragraphs.map(String) }
      : undefined;

  const { id } = await ctx.params;
  const request = await getDocumentRequest(session.tenantId, id);
  if (!request) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

  const employes = await getEmployes(session);
  const employe = employes.find((e) => e.id === request.employeId);
  if (!employe) return NextResponse.json({ error: "Collaborateur introuvable" }, { status: 404 });

  const enterprise = employe.entiteId ? await getEnterprise(session, employe.entiteId) : null;
  if (!enterprise) {
    return NextResponse.json(
      { error: "Entité introuvable dans Neos pour ce collaborateur" },
      { status: 422 }
    );
  }

  const legal = employe.entiteId ? await getEntiteLegalInfo(session.tenantId, employe.entiteId) : null;

  const pdf = await renderDocumentPdf({
    typeDocument: request.typeDocument,
    employe,
    enterprise,
    legal,
    request,
    override,
  });

  const filename = `${request.typeDocument}.pdf`.replace(/[^a-zA-Z0-9._ -]/g, "_");
  const { pathname } = await uploadPrivateBuffer(
    "documents",
    session.tenantId,
    filename,
    "application/pdf",
    pdf
  );

  const updated = await updateDocumentRequest(session.tenantId, id, {
    filePath: pathname,
    statut: "prete",
  });
  if (!updated) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

  if (employe.email) {
    await sendDocumentReadyNotification({
      employeEmail: employe.email,
      employeNom: updated.employeNom,
      typeDocument: updated.typeDocument,
      attachment: { filename, contentType: "application/pdf", data: pdf },
    });
  }

  return NextResponse.json(updated);
}
