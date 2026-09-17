"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Employe } from "@/lib/data";
import { ContratBadge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { ManagerField } from "@/components/ManagerField";

type Probleme = "sans_manager" | "manager_introuvable" | null;

interface Groupe {
  key: string;
  managerNom: string;
  probleme: Probleme;
  reports: Employe[];
}

const PROBLEME_LABEL: Record<Exclude<Probleme, null>, string> = {
  sans_manager: "Sans manager assigné",
  manager_introuvable: "Manager introuvable (référence obsolète)",
};

/** RH-only "checklist" view before opening the évaluations module to
 * collaborateurs/managers : un employé mal rattaché (aucun manager, ou un
 * manager dont l'id ne correspond plus à personne d'actif) casse
 * silencieusement tout le flux objectifs/campagne pour lui, donc les deux
 * cas sont mis en avant en premier plutôt que noyés dans la liste. Chaque
 * ligne réutilise ManagerField (déjà utilisé sur la fiche individuelle) —
 * on corrige ici directement, sans naviguer collaborateur par
 * collaborateur. */
export function PersonnelParManager({ employes }: { employes: Employe[] }) {
  const [search, setSearch] = useState("");
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const employeIds = useMemo(() => new Set(employes.map((e) => e.id)), [employes]);

  const groupes = useMemo(() => {
    const map = new Map<string, Groupe>();
    for (const e of employes) {
      let key: string;
      let managerNom: string;
      let probleme: Probleme = null;
      if (e.managerId == null) {
        key = "sans-manager";
        managerNom = PROBLEME_LABEL.sans_manager;
        probleme = "sans_manager";
      } else if (!employeIds.has(e.managerId)) {
        key = "manager-introuvable";
        managerNom = PROBLEME_LABEL.manager_introuvable;
        probleme = "manager_introuvable";
      } else {
        key = String(e.managerId);
        managerNom = e.managerNom || "—";
      }
      if (!map.has(key)) map.set(key, { key, managerNom, probleme, reports: [] });
      map.get(key)!.reports.push(e);
    }
    return Array.from(map.values()).sort((a, b) => {
      const rank = (g: Groupe) => (g.probleme === "sans_manager" ? 0 : g.probleme === "manager_introuvable" ? 1 : 2);
      const r = rank(a) - rank(b);
      return r !== 0 ? r : a.managerNom.localeCompare(b.managerNom);
    });
  }, [employes, employeIds]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return groupes;
    return groupes
      .map((g) => ({
        ...g,
        reports: g.managerNom.toLowerCase().includes(q)
          ? g.reports
          : g.reports.filter((e) => `${e.fullname} ${e.fonction}`.toLowerCase().includes(q)),
      }))
      .filter((g) => g.reports.length > 0);
  }, [groupes, q]);

  function toggle(key: string) {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const problemCount = groupes.filter((g) => g.probleme).reduce((s, g) => s + g.reports.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-v/10 bg-white px-5 py-3.5">
        <span className="text-[13px] font-semibold text-nb">
          {groupes.length} manager(s) — {employes.length} collaborateurs
        </span>
        {problemCount > 0 && (
          <span className="rounded-full bg-wn/15 px-2 py-0.5 text-[11px] font-semibold text-[#7A4A00]">
            ⚠ {problemCount} à corriger
          </span>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un manager ou un collaborateur…"
          className="ml-auto rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs text-nb outline-none focus:border-v"
        />
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((g) => {
          const defaultOpen = Boolean(g.probleme) || Boolean(q);
          const open = toggled.has(g.key) ? !defaultOpen : defaultOpen;
          return (
            <div
              key={g.key}
              className={`overflow-hidden rounded-[12px] border bg-white ${
                g.probleme ? "border-wn/40" : "border-v/10"
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(g.key)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-gl"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className={`shrink-0 text-gm transition-transform ${open ? "rotate-180" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
                <span className={`text-[13px] font-semibold ${g.probleme ? "text-[#7A4A00]" : "text-nb"}`}>
                  {g.managerNom}
                </span>
                <span className="rounded-full bg-bg2 px-1.5 py-0.5 text-[10px] font-semibold text-gm">
                  {g.reports.length}
                </span>
              </button>

              {open && (
                <div className="flex flex-col gap-2 border-t border-v/10 p-3">
                  {g.reports.map((e) => (
                    <div
                      key={e.id}
                      className="flex flex-col gap-2 rounded-lg border border-v/10 bg-bg p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <Link
                        href={`/personnel/${e.id}`}
                        className="flex min-w-0 items-center gap-2.5 hover:text-v hover:underline"
                      >
                        <Avatar photoUrl={e.photoUrl} fullname={e.fullname} size={28} />
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-medium text-nb">{e.fullname}</div>
                          <div className="truncate text-[11px] text-gm">
                            {e.fonction} · {e.entite}
                          </div>
                        </div>
                        <ContratBadge type={e.contratType} />
                      </Link>
                      <div className="shrink-0 sm:w-[220px]">
                        <ManagerField employeId={e.id} managerId={e.managerId} managerNom={e.managerNom} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-xs text-gm">
            Aucun résultat pour cette recherche.
          </div>
        )}
      </div>
    </div>
  );
}
