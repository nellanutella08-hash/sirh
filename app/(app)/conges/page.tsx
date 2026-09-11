import { getSession } from "@/lib/session";
import { getEmployes } from "@/lib/data";
import { PageHeader } from "@/components/KpiCard";
import { CongesModule } from "@/components/CongesModule";

export default async function CongesPage() {
  const session = await getSession();
  if (!session) return null;
  const employes = await getEmployes(session);

  const congeEmployes = employes.map((e) => ({
    id: e.id,
    fullname: e.fullname,
    entite: e.entite,
    contratType: e.contratType,
    dateEntree: e.dateEntree,
  }));

  return (
    <>
      <PageHeader title="Congés & Absences" subtitle="Soldes, demandes et suivi des absences" />
      <div className="p-6">
        <CongesModule employes={congeEmployes} />
      </div>
    </>
  );
}
