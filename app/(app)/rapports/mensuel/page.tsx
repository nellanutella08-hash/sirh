import Link from "next/link";
import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEmployes } from "@/lib/data";
import { fetchRapportMensuel, defaultYearMonth } from "@/lib/rapportMensuel";
import { PageHeader, KpiCard } from "@/components/KpiCard";
import { MonthPicker } from "@/components/MonthPicker";
import { TurnoverField } from "@/components/TurnoverField";

export default async function RapportMensuelPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);

  const { month } = await searchParams;
  const yearMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : defaultYearMonth();

  const employes = await requireEmployes(session);
  const rapport = await fetchRapportMensuel(session.tenantId, employes, yearMonth);

  return (
    <>
      <PageHeader
        title="Tableau de bord RH Groupe mensuel"
        subtitle={`Effectifs, recrutements, absentéisme, turnover — ${rapport.label}`}
        actions={
          <div className="flex items-center gap-2">
            <MonthPicker yearMonth={yearMonth} />
            <a
              href={`/api/rapports/mensuel/pdf?month=${yearMonth}`}
              className="rounded-lg border border-v/20 px-3 py-1.5 text-xs font-medium text-nb hover:bg-gl"
            >
              PDF
            </a>
            <a
              href={`/api/rapports/mensuel/xlsx?month=${yearMonth}`}
              className="rounded-lg border border-v/20 px-3 py-1.5 text-xs font-medium text-nb hover:bg-gl"
            >
              Excel
            </a>
          </div>
        }
      />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Effectif actuel" value={String(rapport.effectifs.total)} href="/personnel" />
          <KpiCard
            label="Recrutements du mois"
            value={String(rapport.recrutements.total)}
            variant="success"
            href="/recrutement"
          />
          <KpiCard
            label="Jours d'absence"
            value={String(rapport.absenteisme.joursTotal)}
            variant="warn"
            sub={rapport.absenteisme.tauxPct != null ? `Taux : ${rapport.absenteisme.tauxPct}%` : undefined}
          />
          <KpiCard
            label="Turnover"
            value={rapport.turnover.departs != null ? String(rapport.turnover.departs) : "—"}
            variant="danger"
            sub={rapport.turnover.tauxPct != null ? `Taux : ${rapport.turnover.tauxPct}%` : undefined}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section title="Effectifs par entité">
            <BreakdownList rows={rapport.effectifs.parEntite} />
          </Section>
          <Section title="Effectifs par pôle">
            <BreakdownList rows={rapport.effectifs.parPole} />
          </Section>

          <Section title={`Recrutements — ${rapport.label}`}>
            {rapport.recrutements.liste.length === 0 ? (
              <div className="text-xs text-gm">Aucune embauche enregistrée ce mois-ci.</div>
            ) : (
              <ul className="flex flex-col gap-1.5 text-xs">
                {rapport.recrutements.liste.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="font-medium text-nb">{r.fullname}</span>
                    <span className="text-gm">{r.poste}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Absentéisme par entité">
            {rapport.absenteisme.parEntite.length === 0 ? (
              <div className="text-xs text-gm">Aucune absence validée ce mois-ci.</div>
            ) : (
              <BreakdownList rows={rapport.absenteisme.parEntite} suffix="j" />
            )}
          </Section>

          <div className="lg:col-span-2">
            <TurnoverField
              yearMonth={yearMonth}
              departs={rapport.turnover.departs}
              commentaire={rapport.turnover.commentaire}
            />
          </div>
        </div>

        <div className="mt-4 text-xs text-gm">
          <Link href="/rapports" className="text-v hover:underline">
            ← Retour à Rapports &amp; Exports
          </Link>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-v/10 bg-white p-4">
      <div className="mb-3 text-[13px] font-semibold text-nb">{title}</div>
      {children}
    </div>
  );
}

function BreakdownList({ rows, suffix = "" }: { rows: [string, number][]; suffix?: string }) {
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <ul className="flex flex-col gap-2">
      {rows.slice(0, 10).map(([label, value]) => (
        <li key={label} className="flex items-center gap-2 text-xs">
          <span className="w-32 shrink-0 truncate text-nb" title={label}>
            {label}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg">
            <div className="h-full rounded-full bg-v" style={{ width: `${(value / max) * 100}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-gm">
            {value}
            {suffix}
          </span>
        </li>
      ))}
    </ul>
  );
}
