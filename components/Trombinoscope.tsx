"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AnnuaireEmploye } from "@/lib/data";
import { Avatar } from "@/components/Avatar";

export function Trombinoscope({
  employes,
  linkToProfiles = true,
}: {
  employes: AnnuaireEmploye[];
  /** The fiche a card links to is RH-only (salary included) — collaborateurs
   * browsing the shared /annuaire get a plain, non-clickable card instead. */
  linkToProfiles?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [entite, setEntite] = useState("");

  const entites = useMemo(() => Array.from(new Set(employes.map((e) => e.entite))).sort(), [employes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employes
      .filter((e) => (!entite || e.entite === entite) && (!q || `${e.fullname} ${e.fonction}`.toLowerCase().includes(q)))
      .sort((a, b) => a.fullname.localeCompare(b.fullname));
  }, [employes, search, entite]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-v/10 bg-white px-5 py-3.5">
        <span className="text-[13px] font-semibold text-nb">
          {filtered.length} / {employes.length} collaborateurs
        </span>
        <select
          value={entite}
          onChange={(e) => setEntite(e.target.value)}
          className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
        >
          <option value="">Toutes les entités</option>
          {entites.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nom, fonction…"
          className="ml-auto rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs text-nb outline-none focus:border-v"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {filtered.map((e) => {
          const cardClass =
            "flex flex-col items-center gap-2 rounded-[14px] border border-v/10 bg-white p-4 text-center shadow-sm";
          const card = (
            <>
              <Avatar photoUrl={e.photoUrl} fullname={e.fullname} size={72} />
              <div>
                <div className="text-[12px] font-semibold leading-tight text-nb">{e.fullname}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-gm">{e.fonction}</div>
                <div className="mt-0.5 text-[9px] text-gm">{e.entite}</div>
              </div>
            </>
          );
          return linkToProfiles ? (
            <Link key={e.id} href={`/personnel/${e.id}`} className={`${cardClass} hover:border-v/30 hover:shadow-md`}>
              {card}
            </Link>
          ) : (
            <div key={e.id} className={cardClass}>
              {card}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-[14px] border border-v/10 bg-white p-8 text-center text-xs text-gm">
            Aucun collaborateur ne correspond aux filtres.
          </div>
        )}
      </div>
    </div>
  );
}
