import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getDocumentRequest, CACHE_ENABLED } from "@/lib/db";
import { requireEmploye, getEnterprise } from "@/lib/data";
import { DocumentLetter } from "@/components/DocumentLetter";
import { PrintButton } from "@/components/PrintButton";

export default async function GenererDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return null;
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

  return (
    <div className="mx-auto max-w-3xl p-6 print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <div className="rounded-[14px] border border-v/10 bg-white p-12 print:border-none print:p-0 print:shadow-none">
        <DocumentLetter typeDocument={request.typeDocument} employe={employe} enterprise={enterprise} />
      </div>
    </div>
  );
}
