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
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-5 flex items-center gap-3 rounded-[14px] bg-gradient-to-br from-mg to-v px-5 py-4">
        <div>
          <div className="text-[16px] font-semibold text-white">Mes demandes de documents</div>
          <div className="mt-0.5 text-xs text-white/70">
            Attestations, bulletins et autres documents RH
          </div>
        </div>
      </div>
      <MyDocumentsBoard initialRequests={requests} dbEnabled={CACHE_ENABLED} />
    </div>
  );
}
