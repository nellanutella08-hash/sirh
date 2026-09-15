"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Employe } from "@/lib/data";
import type { Alerte } from "@/lib/format";
import { fmtDate, fmtFCFA, joursRestants } from "@/lib/format";
import { AlerteBadge, ContratBadge } from "@/components/Badge";

type TabKey = Alerte | "" | "surveiller";

const TABS: { key: TabKey; label: string }[] = [
  { key: "", label: "Tous" },
  { key: "expiré", label: "❌ Expirés" },
  { key: "a_renouveler", label: "🔴 À renouveler <14j" },
  { key: "surveiller", label: "🟠 À surveiller 30–90j" },
  { key: "urgent", label: "🚨 Urgents 15–30j" },
  { key: "attention", label: "⚠️ 30–90j" },
  { key: "ok", label: "✅ OK" },
  { key: "cdi", label: "CDI / Ind." },
];

export function ContratsView({
  employes,
  initialAlerte = "",
}: {
  employes: Employe[];
  initialAlerte?: string;
}) {
  const [tab, setTab] = useState<TabKey>(
    TABS.some((t) => t.key === initialAlerte) ? (initialAlerte as TabKey) : ""
  );

  const rows = useMemo(() => {
    const filtered = !tab
      ? employes
      : tab === "surveiller"
        ? employes.filter((e) => e.alerte === "urgent" || e.alerte === "attention")
        : employes.filter((e) => e.alerte === tab);
    return filtered.slice().sort((a, b) => {
      const ja = joursRestants(a.dateFin);
      const jb = joursRestants(b.dateFin);
      if (ja === null && jb === null) return 0;
      if (ja === null) return 1;
      if (jb === null) return -1;
      return ja - jb;
    });
  }, [employes, tab]);

  return (
    <>
      <div className="mb-5 flex w-fit gap-0.5 rounded-[10px] bg-bg2 p-1">
        {TABS.map((t) => (
          <button
            key={t.key || "all"}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-[13px] transition-colors ${
              tab === t.key ? "bg-v font-semibold text-white shadow-sm" : "font-medium text-gm hover:text-nb"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-v/10 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {["Collaborateur", "Entité", "Type", "Sal. Net", "Date début", "Date fin", "Jours restants", "Alerte"].map(
                (h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const j = joursRestants(e.dateFin);
              return (
                <tr key={e.id} className="border-b border-v/5 last:border-none hover:bg-gl">
                  <td className="px-3.5 py-2.5 font-medium text-nb">
                    <Link href={`/personnel/${e.id}`} className="hover:text-v hover:underline">
                      {e.fullname}
                    </Link>
                  </td>
                  <td className="px-3.5 py-2.5 text-nb">{e.entite}</td>
                  <td className="px-3.5 py-2.5">
                    <ContratBadge type={e.contratType} />
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-nb">{fmtFCFA(e.salNet)}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-nb">{fmtDate(e.dateDebut)}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-nb">{fmtDate(e.dateFin)}</td>
                  <td className="px-3.5 py-2.5 text-nb">{j === null ? "—" : j}</td>
                  <td className="px-3.5 py-2.5">
                    <AlerteBadge alerte={e.alerte} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3.5 py-10 text-center text-gm">
                  Aucun contrat dans cette catégorie.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
