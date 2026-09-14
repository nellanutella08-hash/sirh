import { getSession } from "@/lib/session";
import { listDocumentRequestsForEmploye, CACHE_ENABLED } from "@/lib/db";
import { MyDocumentsBoard } from "@/components/MyDocumentsBoard";

export default async function MesDocumentsPage() {
  const session = await getSession();
  if (!session) return null;

  const requests = CACHE_ENABLED
    ? await listDocumentRequestsForEmploye(session.tenantId, session.userId)
    : [];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-5">
        <div className="text-[16px] font-semibold text-nb">Mes demandes de documents</div>
        <div className="mt-0.5 text-xs text-gm">
          Attestations, bulletins et autres documents RH
        </div>
      </div>
      <MyDocumentsBoard initialRequests={requests} dbEnabled={CACHE_ENABLED} />
    </div>
  );
}
