import { getSession } from "@/lib/session";
import { requireAnnuaire } from "@/lib/data";
import { PageHeader } from "@/components/KpiCard";
import { Trombinoscope } from "@/components/Trombinoscope";

// Open to every collaborateur, not just RH — deliberately built on the safe
// AnnuaireEmploye[] subset (no salary, no contract data, no phone/email)
// rather than reusing the RH Personnel page's Trombinoscope tab as-is.
export default async function AnnuairePage() {
  const session = await getSession();
  if (!session) return null;

  const employes = await requireAnnuaire(session);

  return (
    <>
      <PageHeader title="Annuaire" subtitle="Retrouver un collègue — nom, fonction, entité" />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <Trombinoscope employes={employes} linkToProfiles={false} />
      </div>
    </>
  );
}
