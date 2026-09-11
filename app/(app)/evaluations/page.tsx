import { getSession } from "@/lib/session";
import { listEvaluations, CACHE_ENABLED } from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { EvaluationsBoard } from "@/components/EvaluationsBoard";

export default async function EvaluationsPage() {
  const session = await getSession();
  if (!session) return null;

  const evaluations = CACHE_ENABLED ? await listEvaluations(session.tenantId) : [];

  return (
    <>
      <PageHeader title="Évaluations" subtitle="Définition d'objectifs et suivi des appréciations" />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <EvaluationsBoard
          initialEvaluations={evaluations}
          currentUserName={session.fullname}
          dbEnabled={CACHE_ENABLED}
        />
      </div>
    </>
  );
}
