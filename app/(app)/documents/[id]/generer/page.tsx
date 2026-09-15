import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { getDocumentRequest, getEntiteLegalInfo, CACHE_ENABLED } from "@/lib/db";
import { requireEmploye, getEnterprise } from "@/lib/data";
import { DocumentLetter } from "@/components/DocumentLetter";
import { PrintButton } from "@/components/PrintButton";
import { SendDocumentButton } from "@/components/SendDocumentButton";

// RH-only: this renders the live, print-ready letter straight from the
// template — it's the source RH prints/saves and re-uploads as the actual
// deliverable (see DocumentsBoard's "Générer" flow). A collaborateur must
// never reach this directly: that would hand them the finished document
// before RH has reviewed the request at all, skipping the whole approval
// step. Collaborateurs only ever get the file RH actually uploaded, once
// the request reaches "prête" (see MyDocumentsBoard).
export default async function GenererDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const { mode: modeParam } = await searchParams;
  const mode = modeParam === "papier" ? "papier" : "numerique";
  const session = await getSession();
  if (!session) return null;
  requireRH(session);
  if (!CACHE_ENABLED) notFound();

  const request = await getDocumentRequest(session.tenantId, id);
  if (!request) notFound();

  const employe = await requireEmploye(session, request.employeId);
  if (!employe) notFound();

  const enterprise = employe.entiteId ? await getEnterprise(session, employe.entiteId) : null;
  if (!enterprise) {
    return (
      <div className="p-6 text-sm text-gm">
        Entité introuvable dans Neos pour ce collaborateur — impossible de générer le document.
      </div>
    );
  }

  const legal = employe.entiteId ? await getEntiteLegalInfo(session.tenantId, employe.entiteId) : null;

  return (
    <div className="mx-auto max-w-3xl p-6 print:p-0">
      <style>{"@media print { @page { size: A4; margin: 0; } }"}</style>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <div className="flex w-fit gap-0.5 rounded-[10px] bg-bg2 p-1">
          <a
            href={`/documents/${id}/generer?mode=numerique`}
            className={`rounded-lg px-3.5 py-1.5 text-xs transition-colors ${
              mode === "numerique" ? "bg-v font-semibold text-white shadow-sm" : "font-medium text-gm hover:text-nb"
            }`}
          >
            Numérique (cachet + signature)
          </a>
          <a
            href={`/documents/${id}/generer?mode=papier`}
            className={`rounded-lg px-3.5 py-1.5 text-xs transition-colors ${
              mode === "papier" ? "bg-v font-semibold text-white shadow-sm" : "font-medium text-gm hover:text-nb"
            }`}
          >
            Papier (à signer/tamponner à la main)
          </a>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          {mode === "numerique" && (
            <SendDocumentButton requestId={id} alreadySent={Boolean(request.filePath)} />
          )}
        </div>
      </div>
      {!legal && (
        <div className="mb-4 rounded-lg border border-wn/30 bg-[#FFF8EC] px-4 py-3 text-xs text-[#7A4A00] print:hidden">
          Les informations légales de « {enterprise.nom} » ne sont pas encore renseignées — le texte
          ci-dessous est incomplet. Complétez-les sur la page{" "}
          <a href="/entites" className="underline">
            Entités juridiques
          </a>
          .
        </div>
      )}
      <div className="rounded-[14px] border border-v/10 bg-white p-12 print:w-[210mm] print:border-none print:p-[15mm] print:shadow-none">
        <DocumentLetter
          typeDocument={request.typeDocument}
          employe={employe}
          enterprise={enterprise}
          legal={legal}
          request={request}
          mode={mode}
        />
      </div>
    </div>
  );
}
