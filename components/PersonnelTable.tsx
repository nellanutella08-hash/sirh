"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Employe } from "@/lib/data";
import { fmtFCFA, fmtDate } from "@/lib/format";
import { AlerteBadge, ContratBadge } from "@/components/Badge";

const PAGE_SIZE = 20;

type SortKey = "nom" | "entite" | "contratType" | "salNet" | "dateFin";

export function PersonnelTable({ employes }: { employes: Employe[] }) {
  const [search, setSearch] = useState("");
  const [entite, setEntite] = useState("");
  const [contrat, setContrat] = useState("");
  const [alerte, setAlerte] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nom");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);

  const entites = useMemo(
    () => Array.from(new Set(employes.map((e) => e.entite))).sort(),
    [employes]
  );
  const contrats = useMemo(
    () => Array.from(new Set(employes.map((e) => e.contratType))).sort(),
    [employes]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = employes.filter((e) => {
      if (entite && e.entite !== entite) return false;
      if (contrat && e.contratType !== contrat) return false;
      if (alerte && e.alerte !== alerte) return false;
      if (
        q &&
        !`${e.fullname} ${e.fonction} ${e.entite}`.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
    rows = rows.slice().sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
    return rows;
  }, [employes, search, entite, contrat, alerte, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
    setPage(1);
  }

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  const th = (label: string, key: SortKey) => (
    <th
      onClick={() => sortBy(key)}
      className="cursor-pointer select-none whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd hover:bg-bg2"
    >
      {label} {sortKey === key ? (sortDir === 1 ? "↑" : "↓") : "↕"}
    </th>
  );

  return (
    <div className="rounded-[14px] border border-v/10 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b border-v/10 px-5 py-3.5">
        <span className="text-[13px] font-semibold text-nb">
          Liste des collaborateurs — {filtered.length} / {employes.length}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            placeholder="Nom, fonction, entité..."
            className="rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs text-nb outline-none focus:border-v"
          />
          <select
            value={entite}
            onChange={(e) => resetPage(setEntite)(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">Toutes les entités</option>
            {entites.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={contrat}
            onChange={(e) => resetPage(setContrat)(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">Tous les contrats</option>
            {contrats.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={alerte}
            onChange={(e) => resetPage(setAlerte)(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">Toutes les alertes</option>
            <option value="expiré">❌ Expirés</option>
            <option value="a_renouveler">🔴 À renouveler (&lt;14j)</option>
            <option value="urgent">🚨 Urgents</option>
            <option value="attention">⚠️ Attention</option>
            <option value="ok">✅ OK</option>
            <option value="cdi">CDI / Indéterminé</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {th("Nom", "nom")}
              {th("Entité", "entite")}
              <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                Fonction
              </th>
              {th("Contrat", "contratType")}
              {th("Sal. Net", "salNet")}
              {th("Fin contrat", "dateFin")}
              <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                Alerte
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((e) => (
              <tr
                key={e.id}
                className="border-b border-v/5 last:border-none hover:bg-gl"
              >
                <td className="px-3.5 py-2.5 font-medium text-nb">
                  <Link href={`/personnel/${e.id}`} className="hover:text-v hover:underline">
                    {e.fullname}
                  </Link>
                </td>
                <td className="px-3.5 py-2.5 text-nb">{e.entite}</td>
                <td className="px-3.5 py-2.5 text-nb">{e.fonction}</td>
                <td className="px-3.5 py-2.5">
                  <ContratBadge type={e.contratType} />
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-nb">
                  {fmtFCFA(e.salNet)}
                </td>
                <td className="whitespace-nowrap px-3.5 py-2.5 text-nb">{fmtDate(e.dateFin)}</td>
                <td className="px-3.5 py-2.5">
                  <AlerteBadge alerte={e.alerte} />
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3.5 py-10 text-center text-gm">
                  Aucun collaborateur ne correspond aux filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-v/10 px-5 py-3">
        <span className="text-xs text-gm">
          Page {page} / {totalPages}
        </span>
        <div className="flex gap-1">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="h-7 w-7 rounded-md border border-v/15 text-xs disabled:opacity-40"
          >
            ‹
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="h-7 w-7 rounded-md border border-v/15 text-xs disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
