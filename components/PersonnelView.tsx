"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Employe } from "@/lib/data";
import { PersonnelTable, type Affectation } from "@/components/PersonnelTable";
import { PersonnelParManager } from "@/components/PersonnelParManager";
import { Trombinoscope } from "@/components/Trombinoscope";

type Tab = "liste" | "manager" | "trombinoscope";
const TABS: Tab[] = ["liste", "manager", "trombinoscope"];

export function PersonnelView({
  employes,
  initialAlerte,
  initialTab,
  enCongeIds,
  affectations,
}: {
  employes: Employe[];
  initialAlerte?: string;
  initialTab?: string;
  enCongeIds?: number[];
  affectations?: Record<number, Affectation>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(
    TABS.includes(initialTab as Tab) ? (initialTab as Tab) : "liste",
  );

  // Le tab actif est reflété dans l'URL (remplacement, sans nouvelle entrée
  // d'historique) pour qu'un retour arrière depuis la fiche d'un employé
  // (ouverte via "Par manager"/Trombinoscope/Organigramme) revienne bien sur
  // ce même onglet, et pas sur "Liste" par défaut.
  function selectTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "liste") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div>
      <div className="mb-4 flex w-fit gap-0.5 rounded-[10px] bg-bg2 p-1">
        {[
          { key: "liste" as const, label: "Liste" },
          { key: "manager" as const, label: "Par manager" },
          { key: "trombinoscope" as const, label: "Trombinoscope" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] transition-colors ${
              tab === t.key ? "bg-v font-semibold text-white shadow-sm" : "font-medium text-gm hover:text-nb"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "liste" && (
        <PersonnelTable
          employes={employes}
          initialAlerte={initialAlerte}
          enCongeIds={enCongeIds}
          affectations={affectations}
        />
      )}
      {tab === "manager" && <PersonnelParManager employes={employes} />}
      {tab === "trombinoscope" && <Trombinoscope employes={employes} />}
    </div>
  );
}
