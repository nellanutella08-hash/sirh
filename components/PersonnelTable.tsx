"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Employe } from "@/lib/data";
import { fmtFCFA, fmtDate } from "@/lib/format";
import { AlerteBadge, ContratBadge, EnCongeBadge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";

const PAGE_SIZE = 20;

type SortKey = "nom" | "entite" | "contratType" | "salNet" | "dateFin";

export interface Affectation {
  categorie: string | null;
  regie: string | null;
  poleTechSupport: string | null;
  classification: "regie" | "hors_regie" | null;
  typeProjet: string | null;
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  regie: "Régie",
  hors_regie: "Hors régie",
};

export function PersonnelTable({
  employes,
  initialAlerte = "",
  enCongeIds = [],
  affectations = {},
}: {
  employes: Employe[];
  initialAlerte?: string;
  enCongeIds?: number[];
  affectations?: Record<number, Affectation>;
}) {
  const router = useRouter();
  const enCongeSet = useMemo(() => new Set(enCongeIds), [enCongeIds]);
  const [search, setSearch] = useState("");
  const [entite, setEntite] = useState("");
  const [contrat, setContrat] = useState("");
  const [alerte, setAlerte] = useState(initialAlerte);
  const [pole, setPole] = useState("");
  const [classification, setClassification] = useState("");
  const [typeProjet, setTypeProjet] = useState("");
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
  const poles = useMemo(
    () =>
      Array.from(
        new Set(Object.values(affectations).map((a) => a.poleTechSupport).filter((v): v is string => Boolean(v)))
      ).sort(),
    [affectations]
  );
  const typesProjet = useMemo(
    () =>
      Array.from(
        new Set(Object.values(affectations).map((a) => a.typeProjet).filter((v): v is string => Boolean(v)))
      ).sort(),
    [affectations]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = employes.filter((e) => {
      if (entite && e.entite !== entite) return false;
      if (contrat && e.contratType !== contrat) return false;
      if (alerte && e.alerte !== alerte) return false;
      const a = affectations[e.id];
      if (pole && a?.poleTechSupport !== pole) return false;
      if (classification && a?.classification !== classification) return false;
      if (typeProjet && a?.typeProjet !== typeProjet) return false;
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
  }, [employes, search, entite, contrat, alerte, pole, classification, typeProjet, affectations, sortKey, sortDir]);

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
          <select
            value={pole}
            onChange={(e) => resetPage(setPole)(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">Tous les pôles</option>
            {poles.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={classification}
            onChange={(e) => resetPage(setClassification)(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">Régie / Hors régie</option>
            <option value="regie">Régie</option>
            <option value="hors_regie">Hors régie</option>
          </select>
          <select
            value={typeProjet}
            onChange={(e) => resetPage(setTypeProjet)(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">Tous les types de projet</option>
            {typesProjet.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
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
              <th className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                Pôle / Régie
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((e) => (
              <tr
                key={e.id}
                onDoubleClick={() => router.push(`/personnel/${e.id}`)}
                className="cursor-pointer border-b border-v/5 last:border-none hover:bg-gl"
              >
                <td className="px-3.5 py-2.5 font-medium text-nb">
                  <Link
                    href={`/personnel/${e.id}`}
                    className="flex items-center gap-2 hover:text-v hover:underline"
                  >
                    <Avatar photoUrl={e.photoUrl} fullname={e.fullname} size={24} />
                    {e.fullname}
                    {enCongeSet.has(e.id) && <EnCongeBadge />}
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
                <td className="px-3.5 py-2.5 text-nb">
                  {affectations[e.id] ? (
                    <div className="flex flex-col gap-0.5">
                      <span>
                        {affectations[e.id].poleTechSupport || "—"}
                        {affectations[e.id].classification && (
                          <span className="ml-1.5 text-[11px] font-medium text-gm">
                            ({CLASSIFICATION_LABEL[affectations[e.id].classification!]})
                          </span>
                        )}
                      </span>
                      {affectations[e.id].regie && (
                        <span className="text-[11px] text-gm">{affectations[e.id].regie}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-gm">—</span>
                  )}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3.5 py-10 text-center text-gm">
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
