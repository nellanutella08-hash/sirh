import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEmployes } from "@/lib/data";
import { PageHeader } from "@/components/KpiCard";
import { Organigramme } from "@/components/Organigramme";

export default async function OrganigrammePage() {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);

  const employes = await requireEmployes(session);

  return (
    <>
      <PageHeader
        title="Organigramme"
        subtitle="Construit à partir des rattachements manager réels — se corrige depuis Personnel → Par manager"
      />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <Organigramme employes={employes} />
      </div>
    </>
  );
}
