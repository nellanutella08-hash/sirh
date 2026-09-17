import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEmployes } from "@/lib/data";
import { isEnConge } from "@/lib/format";
import { listCongeRequests, getPersonnelAffectations, CACHE_ENABLED } from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { PersonnelView } from "@/components/PersonnelView";
import { PersonnelImportPanel } from "@/components/PersonnelImportPanel";

export default async function PersonnelPage({
  searchParams,
}: {
  searchParams: Promise<{ alerte?: string; tab?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);
  const employes = await requireEmployes(session);
  const { alerte, tab } = await searchParams;

  const congeRequests = CACHE_ENABLED ? await listCongeRequests(session.tenantId) : [];
  const parEmploye = new Map<number, typeof congeRequests>();
  for (const r of congeRequests) {
    parEmploye.set(r.employeId, [...(parEmploye.get(r.employeId) ?? []), r]);
  }
  const enCongeIds = Array.from(parEmploye.entries())
    .filter(([, requests]) => isEnConge(requests))
    .map(([employeId]) => employeId);

  const affectationsMap = CACHE_ENABLED ? await getPersonnelAffectations(session.tenantId) : new Map();
  const affectations: Record<
    number,
    { categorie: string | null; regie: string | null; poleTechSupport: string | null; classification: "regie" | "hors_regie" | null; typeProjet: string | null }
  > = {};
  for (const [employeId, a] of affectationsMap) {
    affectations[employeId] = {
      categorie: a.categorie,
      regie: a.regie,
      poleTechSupport: a.poleTechSupport,
      classification: a.classification,
      typeProjet: a.typeProjet,
    };
  }

  return (
    <>
      <PageHeader
        title="Fichier du personnel"
        subtitle={`${employes.length} collaborateurs — source Neos`}
        actions={<PersonnelImportPanel />}
      />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <PersonnelView
          employes={employes}
          initialAlerte={alerte}
          initialTab={tab}
          enCongeIds={enCongeIds}
          affectations={affectations}
        />
      </div>
    </>
  );
}
