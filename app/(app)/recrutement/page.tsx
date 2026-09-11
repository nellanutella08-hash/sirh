import { getSession } from "@/lib/session";
import { listCandidates, CACHE_ENABLED } from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { RecruitmentBoard } from "@/components/RecruitmentBoard";

export default async function RecrutementPage() {
  const session = await getSession();
  if (!session) return null;

  const candidates = CACHE_ENABLED ? await listCandidates(session.tenantId) : [];

  return (
    <>
      <PageHeader title="Recrutement" subtitle="Pipeline des candidatures" />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <RecruitmentBoard initialCandidates={candidates} dbEnabled={CACHE_ENABLED} />
      </div>
    </>
  );
}
