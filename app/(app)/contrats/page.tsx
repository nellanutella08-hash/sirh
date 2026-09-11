import { getSession } from "@/lib/session";
import { getEmployes, getKpis, fmtFCFA } from "@/lib/data";
import { PageHeader, KpiCard } from "@/components/KpiCard";
import { ContratsView } from "@/components/ContratsView";

export default async function ContratsPage() {
  const session = await getSession();
  if (!session) return null;
  const employes = await getEmployes(session);
  const kpis = getKpis(employes);

  return (
    <>
      <PageHeader title="Contrats & Alertes" subtitle="Suivi des échéances et urgences" />
      <div className="p-6">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard label="Contrats expirés" value={String(kpis.expires)} variant="danger" />
          <KpiCard label="À renouveler (<14j)" value={String(kpis.renouvellementImmediat)} variant="danger" />
          <KpiCard label="À surveiller (90j)" value={String(kpis.aRenouveler)} variant="warn" />
          <KpiCard label="CDI / Indéterminé" value={String(kpis.cdi)} variant="success" />
          <KpiCard label="Effectif total" value={String(kpis.total)} />
          <KpiCard label="Masse salariale nette" value={fmtFCFA(kpis.masseNette)} variant="mag" />
        </div>
        <ContratsView employes={employes} />
      </div>
    </>
  );
}
