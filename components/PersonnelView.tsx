"use client";

import { useState } from "react";
import type { Employe } from "@/lib/data";
import { PersonnelTable, type Affectation } from "@/components/PersonnelTable";
import { PersonnelParManager } from "@/components/PersonnelParManager";

export function PersonnelView({
  employes,
  initialAlerte,
  enCongeIds,
  affectations,
}: {
  employes: Employe[];
  initialAlerte?: string;
  enCongeIds?: number[];
  affectations?: Record<number, Affectation>;
}) {
  const [tab, setTab] = useState<"liste" | "manager">("liste");

  return (
    <div>
      <div className="mb-4 flex w-fit gap-0.5 rounded-[10px] bg-bg2 p-1">
        {[
          { key: "liste" as const, label: "Liste" },
          { key: "manager" as const, label: "Par manager" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
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
    </div>
  );
}
