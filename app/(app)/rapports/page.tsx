import { getSession } from "@/lib/session";
import { getEmployes, getKpis, fmtDate, fmtFCFA, joursRestants } from "@/lib/data";
import { PageHeader } from "@/components/KpiCard";
import { AlerteBadge } from "@/components/Badge";

export default async function RapportsPage() {
  const session = await getSession();
  if (!session) return null;
  const employes = await getEmployes(session);
  const kpis = getKpis(employes);

  const alertes = employes
    .filter(
      (e) =>
        e.alerte === "expiré" ||
        e.alerte === "a_renouveler" ||
        e.alerte === "urgent" ||
        e.alerte === "attention"
    )
    .sort((a, b) => (joursRestants(a.dateFin) ?? 0) - (joursRestants(b.dateFin) ?? 0));

  const today = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title="Rapports & Exports" subtitle="Génération de rapports RH à partir des données Neos" />
      <div className="p-6">
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <a
            href="/api/export/csv"
            className="block rounded-[14px] border border-v/10 bg-white p-5 hover:shadow-[0_2px_8px_rgba(75,40,130,0.08)]"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-gl">
                <svg width="22" height="22" fill="none" stroke="#4B2882" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold">Export CSV — Personnel complet</div>
                <div className="mt-0.5 text-xs text-gm">{employes.length} collaborateurs — toutes colonnes</div>
              </div>
            </div>
            <div className="text-xs text-gm">
              Exporte les données du personnel (depuis Neos, en direct) au format CSV pour Excel.
            </div>
            <div className="mt-3 inline-block rounded-lg border border-v/20 px-3 py-1.5 text-xs font-medium">
              Télécharger CSV
            </div>
          </a>

          <div className="rounded-[14px] border border-v/10 bg-white p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-[#FFF3EE]">
                <svg width="22" height="22" fill="none" stroke="#FF6B35" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth={2} />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold">Rapport alertes contrats</div>
                <div className="mt-0.5 text-xs text-gm">{alertes.length} contrat(s) à traiter</div>
              </div>
            </div>
            <div className="text-xs text-gm">Détail ci-dessous — visible à l&apos;impression (Ctrl/Cmd+P).</div>
          </div>
        </div>

        <div className="rounded-[14px] border border-v/10 bg-white p-6 print:border-none print:p-0 print:shadow-none">
          <div className="mb-5 border-b border-v/10 pb-4">
            <div className="text-[15px] font-semibold text-nb">Compte rendu RH — Groupe Synelia</div>
            <div className="mt-1 text-xs text-gm capitalize">{today}</div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Effectif" value={kpis.total} />
            <Stat label="CDI / Indéterminé" value={kpis.cdi} />
            <Stat label="À renouveler (90j)" value={kpis.aRenouveler} />
            <Stat label="Expirés" value={kpis.expires} />
          </div>
          <div className="mb-6 text-xs text-gm">
            Masse salariale nette totale : <strong className="text-nb">{fmtFCFA(kpis.masseNette)}</strong>
          </div>

          <div className="mb-2 text-[13px] font-semibold text-nb">Contrats à traiter en priorité</div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-bg">
                {["Collaborateur", "Entité", "Fonction", "Date fin", "Alerte"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alertes.slice(0, 30).map((e) => (
                <tr key={e.id} className="border-b border-v/5 last:border-none">
                  <td className="px-3 py-2 font-medium text-nb">{e.fullname}</td>
                  <td className="px-3 py-2 text-nb">{e.entite}</td>
                  <td className="px-3 py-2 text-nb">{e.fonction}</td>
                  <td className="px-3 py-2 text-nb">{fmtDate(e.dateFin)}</td>
                  <td className="px-3 py-2">
                    <AlerteBadge alerte={e.alerte} jours={joursRestants(e.dateFin)} />
                  </td>
                </tr>
              ))}
              {alertes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gm">
                    Aucun contrat à traiter — tout est à jour.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gm">{label}</div>
      <div className="font-mono text-lg font-semibold text-v">{value}</div>
    </div>
  );
}
