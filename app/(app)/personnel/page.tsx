import { getSession } from "@/lib/session";
import { getEmployes } from "@/lib/data";
import { PageHeader } from "@/components/KpiCard";
import { PersonnelTable } from "@/components/PersonnelTable";

export default async function PersonnelPage() {
  const session = await getSession();
  if (!session) return null;
  const employes = await getEmployes(session);

  return (
    <>
      <PageHeader title="Fichier du personnel" subtitle={`${employes.length} collaborateurs — source Neos`} />
      <div className="p-6">
        <PersonnelTable employes={employes} />
      </div>
    </>
  );
}
