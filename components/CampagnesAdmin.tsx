"use client";

import { useState } from "react";

export interface Campagne {
  id: string;
  nom: string;
  annee: string;
  entites: string[];
  statut: "ouverte" | "fermee";
  openedAt: string | null;
  closedAt: string | null;
}

/** RH-only: opens/closes the évaluation campagnes that gate auto-éval and
 * notation on every fiche confirmée. Scoped by entités so, e.g., Synelia
 * Burkina and le reste du groupe can be ouvertes séparément en parallèle. */
export function CampagnesAdmin({
  initialCampagnes,
  entitesDisponibles,
  onChange,
}: {
  initialCampagnes: Campagne[];
  entitesDisponibles: string[];
  onChange?: (campagnes: Campagne[]) => void;
}) {
  const [campagnes, setCampagnesState] = useState(initialCampagnes);
  function setCampagnes(next: Campagne[] | ((prev: Campagne[]) => Campagne[])) {
    setCampagnesState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: Campagne[]) => Campagne[])(prev) : next;
      onChange?.(resolved);
      return resolved;
    });
  }
  const [showForm, setShowForm] = useState(false);
  const [nom, setNom] = useState("");
  const [annee, setAnnee] = useState(String(new Date().getFullYear()));
  const [entites, setEntites] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleEntite(e: string) {
    setEntites((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  async function creer(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/evaluations/campagnes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom, annee, entites }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error ?? "Échec");
    setCampagnes((prev) => [data as Campagne, ...prev]);
    setNom("");
    setEntites([]);
    setShowForm(false);
  }

  async function setStatut(c: Campagne, statut: "ouverte" | "fermee") {
    const res = await fetch(`/api/evaluations/campagnes/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCampagnes((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setShowForm((v) => !v)} className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm">
          + Nouvelle campagne
        </button>
      </div>

      {showForm && (
        <form onSubmit={creer} className="mb-4 rounded-[14px] border border-v/10 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Nom (ex: Évaluation S1 2027)"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
            />
            <input
              required
              placeholder="Année"
              value={annee}
              onChange={(e) => setAnnee(e.target.value)}
              className="rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
            />
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gd">
              Entités concernées — aucune coché = toute l&apos;entreprise
            </label>
            <div className="flex flex-wrap gap-2">
              {entitesDisponibles.map((e) => (
                <label
                  key={e}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] ${
                    entites.includes(e) ? "border-v bg-v/10 text-v" : "border-v/15 text-gm"
                  }`}
                >
                  <input type="checkbox" className="hidden" checked={entites.includes(e)} onChange={() => toggleEntite(e)} />
                  {e}
                </label>
              ))}
            </div>
          </div>
          {error && <div className="mt-2 text-xs text-er">{error}</div>}
          <div className="mt-3 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
            >
              Créer (fermée par défaut)
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-[14px] border border-v/10 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {["Nom", "Année", "Entités", "Statut", ""].map((h) => (
                <th key={h} className="px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campagnes.map((c) => (
              <tr key={c.id} className="border-b border-v/5 last:border-none">
                <td className="px-3.5 py-2.5 font-medium text-nb">{c.nom}</td>
                <td className="px-3.5 py-2.5 text-nb">{c.annee}</td>
                <td className="px-3.5 py-2.5 text-nb">{c.entites.length ? c.entites.join(", ") : "Toutes"}</td>
                <td className="px-3.5 py-2.5">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={
                      c.statut === "ouverte" ? { background: "#E6FAF4", color: "#0A5C3A" } : { background: "#F5F5F5", color: "#666" }
                    }
                  >
                    {c.statut === "ouverte" ? "Ouverte" : "Fermée"}
                  </span>
                </td>
                <td className="px-3.5 py-2.5">
                  {c.statut === "ouverte" ? (
                    <button onClick={() => setStatut(c, "fermee")} className="text-[11px] text-er hover:underline">
                      Fermer
                    </button>
                  ) : (
                    <button onClick={() => setStatut(c, "ouverte")} className="text-[11px] text-v hover:underline">
                      Ouvrir
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {campagnes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3.5 py-8 text-center text-gm">
                  Aucune campagne créée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
