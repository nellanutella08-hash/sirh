import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEnterprises } from "@/lib/data";
import { getEntiteLegalInfos, CACHE_ENABLED } from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { EntiteLegalForm } from "@/components/EntiteLegalForm";

export default async function EntitesPage() {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);

  const enterprises = await requireEnterprises(session);
  const legalInfos = CACHE_ENABLED ? await getEntiteLegalInfos(session.tenantId) : new Map();

  return (
    <>
      <PageHeader
        title="Entités juridiques"
        subtitle="Informations légales utilisées pour générer attestations et ordres de mission"
      />
      <div className="animate-[fade-in_.2s_ease-out] flex flex-col gap-4 p-6">
        {enterprises.map((e) => (
          <EntiteLegalForm
            key={e.id}
            entiteId={e.id}
            entiteNom={e.nom}
            initial={legalInfos.get(e.id) ?? null}
          />
        ))}
        {enterprises.length === 0 && (
          <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-sm text-gm">
            Aucune entité trouvée dans Neos.
          </div>
        )}
      </div>
    </>
  );
}
