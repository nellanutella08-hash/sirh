import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { getDocumentRequest, getEntiteLegalInfo, CACHE_ENABLED } from "@/lib/db";
import { requireEmploye, getEnterprise } from "@/lib/data";
import { DocumentLetter } from "@/components/DocumentLetter";
import { PrintButton } from "@/components/PrintButton";

// RH-only: this renders the live, print-ready letter straight from the
// template — it's the source RH prints/saves and re-uploads as the actual
// deliverable (see DocumentsBoard's "Générer" flow). A collaborateur must
// never reach this directly: that would hand them the finished document
// before RH has reviewed the request at all, skipping the whole approval
// step. Collaborateurs only ever get the file RH actually uploaded, once
// the request reaches "prête" (see MyDocumentsBoard).
export default async function GenererDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
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
        />
      </div>
    </div>
  );
}
