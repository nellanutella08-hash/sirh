import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { listDocumentRequests, CACHE_ENABLED } from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { DocumentsBoard } from "@/components/DocumentsBoard";

export default async function DocumentsPage() {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);

  const requests = CACHE_ENABLED ? await listDocumentRequests(session.tenantId) : [];

  return (
    <>
      <PageHeader
        title="Demandes de documents"
        subtitle="Attestations, bulletins et autres documents RH"
        actions={
          <a
            href="/documents/apercu-modeles"
            className="rounded-lg border border-v/20 px-3.5 py-1.5 text-xs font-medium text-nb hover:bg-gl"
          >
            Aperçu des modèles
          </a>
        }
      />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <DocumentsBoard initialRequests={requests} dbEnabled={CACHE_ENABLED} />
      </div>
    </>
  );
}
