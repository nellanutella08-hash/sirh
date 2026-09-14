import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEmployes, getKpis, fmtFCFA } from "@/lib/data";
import { PageHeader, KpiCard } from "@/components/KpiCard";
import { ContratsView } from "@/components/ContratsView";

export default async function ContratsPage({
  searchParams,
}: {
  searchParams: Promise<{ alerte?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);
  const employes = await requireEmployes(session);
  const kpis = getKpis(employes);
  const { alerte } = await searchParams;

  return (
    <>
      <PageHeader title="Contrats & Alertes" subtitle="Suivi des échéances et urgences" />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Contrats expirés" value={String(kpis.expires)} variant="danger" href="/contrats?alerte=expiré" />
          <KpiCard
            label="À renouveler (<14j)"
            value={String(kpis.renouvellementImmediat)}
            variant="danger"
            href="/contrats?alerte=a_renouveler"
          />
          <KpiCard
            label="À surveiller (90j)"
            value={String(kpis.aRenouveler)}
            variant="warn"
            href="/contrats?alerte=surveiller"
          />
          <KpiCard
            label="CDI / Indéterminé"
            value={String(kpis.cdi)}
            variant="success"
            href="/personnel?alerte=cdi"
          />
          <KpiCard label="Effectif total" value={String(kpis.total)} href="/personnel" />
          <KpiCard label="Masse salariale nette" value={fmtFCFA(kpis.masseNette)} variant="mag" href="/masse-salariale" />
        </div>
        <ContratsView employes={employes} initialAlerte={alerte} />
      </div>
    </>
  );
}
