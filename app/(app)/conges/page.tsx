import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEmployes } from "@/lib/data";
import { listCongeRequests, CACHE_ENABLED } from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { CongesModule } from "@/components/CongesModule";

export default async function CongesPage() {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);
  const employes = await requireEmployes(session);

  const congeEmployes = employes.map((e) => ({
    id: e.id,
    fullname: e.fullname,
    entite: e.entite,
    contratType: e.contratType,
    dateEntree: e.dateEntree,
    photoUrl: e.photoUrl,
  }));

  const requests = CACHE_ENABLED ? await listCongeRequests(session.tenantId) : [];

  return (
    <>
      <PageHeader title="Congés & Absences" subtitle="Soldes, demandes et suivi des absences" />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <CongesModule employes={congeEmployes} initialRequests={requests} dbEnabled={CACHE_ENABLED} />
      </div>
    </>
  );
}
