import { getSession } from "@/lib/session";
import { listDocumentRequests, CACHE_ENABLED } from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { DocumentsBoard } from "@/components/DocumentsBoard";

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session) return null;

  const requests = CACHE_ENABLED ? await listDocumentRequests(session.tenantId) : [];

  return (
    <>
      <PageHeader title="Demandes de documents" subtitle="Attestations, bulletins et autres documents RH" />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <DocumentsBoard initialRequests={requests} dbEnabled={CACHE_ENABLED} />
      </div>
    </>
  );
}
