import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEnterprises } from "@/lib/data";
import { getEntiteLegalInfos, DOCUMENT_TYPES, CACHE_ENABLED } from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { ApercuModeles } from "@/components/ApercuModeles";

/** RH-only review tool: renders every document type against a fictitious
 * collaborateur for each contract profile (CDI/CDD/Consultant/Stagiaire),
 * using a real entité's actual letterhead/legal info/cachet — so RH can
 * check wording and rendering (including the signature/cachet) without
 * touching a real employé or a real document request. */
export default async function ApercuModelesPage() {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);

  const enterprises = await requireEnterprises(session);
  const legalMap = CACHE_ENABLED ? await getEntiteLegalInfos(session.tenantId) : new Map();
  const entites = enterprises.map((enterprise) => ({ enterprise, legal: legalMap.get(enterprise.id) ?? null }));

  return (
    <>
      <PageHeader
        title="Aperçu des modèles de documents"
        subtitle="Le rendu de chaque type de document par profil de contrat — pour repérer et corriger les incohérences"
      />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <ApercuModeles documentTypes={[...DOCUMENT_TYPES]} entites={entites} />
      </div>
    </>
  );
}
