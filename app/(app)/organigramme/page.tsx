import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { requireEmployes, requireAnnuaire } from "@/lib/data";
import { PageHeader } from "@/components/KpiCard";
import { Organigramme } from "@/components/Organigramme";

// Open to everyone, not just RH — but RH gets the full Employe[] (fiches
// cliquables) while every other collaborateur gets the safe AnnuaireEmploye[]
// subset (no salary, no contract data) via requireAnnuaire.
export default async function OrganigrammePage() {
  const session = await getSession();
  if (!session) return null;
  const rh = isRH(session);

  const employes = rh ? await requireEmployes(session) : await requireAnnuaire(session);

  return (
    <>
      <PageHeader
        title="Organigramme"
        subtitle={
          rh
            ? "Construit à partir des rattachements manager réels — se corrige depuis Personnel → Par manager"
            : "Construit à partir des rattachements manager réels dans Neos"
        }
        hasSearchBarAbove={rh}
      />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <Organigramme employes={employes} linkToProfiles={rh} />
      </div>
    </>
  );
}
