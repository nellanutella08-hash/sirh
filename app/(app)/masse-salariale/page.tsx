import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEmployes, countBy, sumByGroup, fmtFCFA } from "@/lib/data";
import { PageHeader, KpiCard } from "@/components/KpiCard";
import { ChartCard, BarChart } from "@/components/Charts";

export default async function MasseSalarialePage() {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);
  const employes = await requireEmployes(session);

  const effectifParEntite = countBy(employes, "entite");
  const masseNetteParEntite = sumByGroup(employes, "entite", "salNet");
  const masseBruteParEntite = sumByGroup(employes, "entite", "salBrut");

  const entites = Object.keys(effectifParEntite).sort(
    (a, b) => (masseNetteParEntite[b] ?? 0) - (masseNetteParEntite[a] ?? 0)
  );

  const totalNette = Object.values(masseNetteParEntite).reduce((s, v) => s + v, 0);

  const effectifParContrat = countBy(employes, "contratType");
  const masseNetteParContrat = sumByGroup(employes, "contratType", "salNet");
  const contrats = Object.keys(effectifParContrat).sort(
    (a, b) => (masseNetteParContrat[b] ?? 0) - (masseNetteParContrat[a] ?? 0)
  );

  return (
    <>
      <PageHeader title="Masse Salariale" subtitle="Analyse multi-dimensionnelle" />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Effectif" value={String(employes.length)} />
          <KpiCard label="Masse nette totale" value={fmtFCFA(totalNette)} variant="mag" />
          <KpiCard
            label="Salaire net moyen"
            value={fmtFCFA(employes.length ? totalNette / employes.length : 0)}
          />
          <KpiCard label="Entités" value={String(entites.length)} />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <ChartCard title="Masse nette par entité (M FCFA)">
            <BarChart
              labels={entites.slice(0, 10)}
              data={entites.slice(0, 10).map((e) => Math.round((masseNetteParEntite[e] ?? 0) / 1_000_000))}
            />
          </ChartCard>
          <ChartCard title="Masse nette par type de contrat (M FCFA)">
            <BarChart
              labels={contrats}
              data={contrats.map((c) => Math.round((masseNetteParContrat[c] ?? 0) / 1_000_000))}
              color="#C0297A"
            />
          </ChartCard>
        </div>

        <div className="mb-5 overflow-x-auto rounded-[14px] border border-v/10 bg-white">
          <div className="border-b border-v/10 px-5 py-3.5 text-[13px] font-semibold text-nb">
            Détail par entité
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-bg">
                {["Entité", "Effectif", "Masse Nette", "Masse Brute", "Sal. Moy Net", "% Masse"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entites.map((ent) => {
                const eff = effectifParEntite[ent] ?? 0;
                const nette = masseNetteParEntite[ent] ?? 0;
                const brute = masseBruteParEntite[ent] ?? 0;
                return (
                  <tr key={ent} className="border-b border-v/5 last:border-none hover:bg-gl">
                    <td className="px-3.5 py-2.5 font-medium text-nb">{ent}</td>
                    <td className="px-3.5 py-2.5 text-nb">{eff}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-nb">{fmtFCFA(nette)}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-nb">{fmtFCFA(brute)}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-nb">
                      {fmtFCFA(eff ? nette / eff : 0)}
                    </td>
                    <td className="px-3.5 py-2.5 text-nb">
                      {totalNette ? ((nette / totalNette) * 100).toFixed(1) : "0"}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-[14px] border border-v/10 bg-white">
          <div className="border-b border-v/10 px-5 py-3.5 text-[13px] font-semibold text-nb">
            Détail par type de contrat
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-bg">
                {["Type", "Effectif", "Masse Nette", "Sal. Moy Net", "% Effectif"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contrats.map((c) => {
                const eff = effectifParContrat[c] ?? 0;
                const nette = masseNetteParContrat[c] ?? 0;
                return (
                  <tr key={c} className="border-b border-v/5 last:border-none hover:bg-gl">
                    <td className="px-3.5 py-2.5 font-medium text-nb">{c}</td>
                    <td className="px-3.5 py-2.5 text-nb">{eff}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-nb">{fmtFCFA(nette)}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-nb">
                      {fmtFCFA(eff ? nette / eff : 0)}
                    </td>
                    <td className="px-3.5 py-2.5 text-nb">
                      {employes.length ? ((eff / employes.length) * 100).toFixed(1) : "0"}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
