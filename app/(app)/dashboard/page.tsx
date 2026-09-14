import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEmployes, getKpis, countBy, sumByGroup, fmtFCFA } from "@/lib/data";
import { PageHeader, KpiCard } from "@/components/KpiCard";
import { ChartCard, DoughnutChart, BarChart } from "@/components/Charts";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);

  const employes = await requireEmployes(session);
  const kpis = getKpis(employes);

  const parEntite = Object.entries(countBy(employes, "entite")).sort((a, b) => b[1] - a[1]);
  const parContrat = Object.entries(countBy(employes, "contratType")).sort((a, b) => b[1] - a[1]);
  const parAlerte = countBy(employes, "alerte");
  const alerteLabels: Record<string, string> = {
    ok: "OK",
    attention: "Attention (30-90j)",
    urgent: "Urgent (15-30j)",
    a_renouveler: "À renouveler (<14j)",
    expiré: "Expiré",
    cdi: "CDI / Indéterminé",
  };

  const masseParEntite = Object.entries(sumByGroup(employes, "entite", "salNet"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <>
      <PageHeader title="Tableau de bord RH" subtitle="Groupe Synelia — données en direct depuis Neos" />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        {(kpis.expires > 0 || kpis.renouvellementImmediat > 0 || kpis.aRenouveler > 0) && (
          <div className="mb-5 flex cursor-pointer items-center gap-3 rounded-lg border border-[#FFD0B5] bg-[#FFF3EE] px-4 py-3 hover:bg-[#FFE8D8]">
            <span className="h-2 w-2 shrink-0 animate-[pulse-dot_2s_infinite] rounded-full bg-wn" />
            <div className="text-[13px] text-gd">
              <strong className="text-er">{kpis.expires} contrat(s) expiré(s)</strong>,{" "}
              <strong className="text-er">{kpis.renouvellementImmediat} à renouveler sous 14 jours</strong>{" "}
              et <strong className="text-wn">{kpis.aRenouveler} sous 90 jours</strong> — consultez la page
              Contrats &amp; Alertes.
            </div>
          </div>
        )}

        <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          <KpiCard label="Effectif total" value={String(kpis.total)} sub="Collaborateurs actifs" />
          <KpiCard label="CDI / Indéterminé" value={String(kpis.cdi)} variant="success" />
          <KpiCard
            label="À renouveler (<14j)"
            value={String(kpis.renouvellementImmediat)}
            variant="danger"
            sub="Renouvellement immédiat"
          />
          <KpiCard
            label="À surveiller (90j)"
            value={String(kpis.aRenouveler)}
            variant="warn"
            sub="Urgents + attention"
          />
          <KpiCard label="Contrats expirés" value={String(kpis.expires)} variant="danger" />
          <KpiCard label="Masse salariale nette" value={fmtFCFA(kpis.masseNette)} variant="mag" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ChartCard title="Effectifs par entité">
            <BarChart
              labels={parEntite.slice(0, 10).map(([k]) => k)}
              data={parEntite.slice(0, 10).map(([, v]) => v)}
            />
          </ChartCard>
          <ChartCard title="Répartition types de contrat">
            <DoughnutChart
              labels={parContrat.map(([k]) => k)}
              data={parContrat.map(([, v]) => v)}
            />
          </ChartCard>
          <ChartCard title="Alertes contrats">
            <DoughnutChart
              labels={Object.keys(parAlerte).map((k) => alerteLabels[k] ?? k)}
              data={Object.values(parAlerte)}
            />
          </ChartCard>
          <ChartCard title="Masse salariale nette par entité (top 8)">
            <BarChart
              labels={masseParEntite.map(([k]) => k)}
              data={masseParEntite.map(([, v]) => Math.round(v / 1_000_000))}
              color="#C0297A"
            />
          </ChartCard>
        </div>
      </div>
    </>
  );
}
