import { getSession } from "@/lib/session";
import { getEmployes, getDemographics } from "@/lib/data";
import { PageHeader, KpiCard } from "@/components/KpiCard";
import { ChartCard, DoughnutChart, BarChart } from "@/components/Charts";

export default async function DemographiePage() {
  const session = await getSession();
  if (!session) return null;
  const employes = await getEmployes(session);
  const demo = getDemographics(employes);

  const hommes = demo.genre["Hommes"] ?? 0;
  const femmes = demo.genre["Femmes"] ?? 0;

  return (
    <>
      <PageHeader title="Démographie" subtitle="Analyse RH du capital humain" />
      <div className="p-6">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Effectif total" value={String(employes.length)} />
          <KpiCard
            label="Hommes"
            value={String(hommes)}
            sub={employes.length ? `${((hommes / employes.length) * 100).toFixed(0)}%` : undefined}
          />
          <KpiCard
            label="Femmes"
            value={String(femmes)}
            variant="mag"
            sub={employes.length ? `${((femmes / employes.length) * 100).toFixed(0)}%` : undefined}
          />
          <KpiCard label="Nationalités représentées" value={String(demo.nationalites.length)} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ChartCard title="Répartition Hommes / Femmes">
            <DoughnutChart labels={Object.keys(demo.genre)} data={Object.values(demo.genre)} />
          </ChartCard>
          <ChartCard title="Distribution par tranche d'âge">
            <BarChart labels={Object.keys(demo.ages)} data={Object.values(demo.ages)} />
          </ChartCard>
          <ChartCard title="Top nationalités">
            <DoughnutChart
              labels={demo.nationalites.map(([k]) => k)}
              data={demo.nationalites.map(([, v]) => v)}
            />
          </ChartCard>
          <ChartCard title="Statut matrimonial">
            <DoughnutChart
              labels={Object.keys(demo.statutMatrimonial)}
              data={Object.values(demo.statutMatrimonial)}
            />
          </ChartCard>
        </div>
      </div>
    </>
  );
}
