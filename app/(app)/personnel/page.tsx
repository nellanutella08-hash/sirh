import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEmployes } from "@/lib/data";
import { PageHeader } from "@/components/KpiCard";
import { PersonnelTable } from "@/components/PersonnelTable";

export default async function PersonnelPage({
  searchParams,
}: {
  searchParams: Promise<{ alerte?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);
  const employes = await requireEmployes(session);
  const { alerte } = await searchParams;

  return (
    <>
      <PageHeader title="Fichier du personnel" subtitle={`${employes.length} collaborateurs — source Neos`} />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <PersonnelTable employes={employes} initialAlerte={alerte} />
      </div>
    </>
  );
}
