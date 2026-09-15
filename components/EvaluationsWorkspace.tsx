"use client";

import { useState } from "react";
import { FicheObjectifs, type Evaluation } from "@/components/FicheObjectifs";

interface EquipeMember {
  id: number;
  fullname: string;
  fonction: string;
}

export function EvaluationsWorkspace({
  mesFiches: mesFichesInitial,
  equipeFiches: equipeFichesInitial,
  equipe,
}: {
  mesFiches: Evaluation[];
  equipeFiches: Evaluation[];
  equipe: EquipeMember[];
}) {
  const [mesFiches, setMesFiches] = useState(mesFichesInitial);
  const [equipeFiches, setEquipeFiches] = useState(equipeFichesInitial);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeId, setEmployeId] = useState("");
  const [annee, setAnnee] = useState(String(new Date().getFullYear()));

  function updateMienne(updated: Evaluation) {
    setMesFiches((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function updateEquipe(updated: Evaluation) {
    setEquipeFiches((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function removeEquipe(id: string) {
    setEquipeFiches((prev) => prev.filter((e) => e.id !== id));
  }

  async function creerFiche(ev: React.FormEvent) {
    ev.preventDefault();
    if (!employeId || !annee.trim()) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeId: Number(employeId), annee: annee.trim() }),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(data.error ?? "Échec de la création");
      return;
    }
    setEquipeFiches((prev) => [data as Evaluation, ...prev]);
    setEmployeId("");
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-3 text-[13px] font-semibold text-nb">Mes objectifs</div>
        {mesFiches.length === 0 ? (
          <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-xs text-gm">
            Aucune fiche d&apos;objectifs ne vous a encore été assignée.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {mesFiches.map((e) => (
              <FicheObjectifs key={e.id} evaluation={e} viewer="employe" onChange={updateMienne} />
            ))}
          </div>
        )}
      </div>

      {equipe.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[13px] font-semibold text-nb">Objectifs de mon équipe</div>
          </div>

          <form
            onSubmit={creerFiche}
            className="mb-4 flex flex-wrap items-end gap-2 rounded-[14px] border border-v/10 bg-white p-3"
          >
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gd">Collaborateur</label>
              <select
                required
                value={employeId}
                onChange={(e) => setEmployeId(e.target.value)}
                className="rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
              >
                <option value="">Sélectionner…</option>
                {equipe.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullname} — {m.fonction}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gd">Année</label>
              <input
                required
                value={annee}
                onChange={(e) => setAnnee(e.target.value)}
                className="w-24 rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
            >
              + Nouvelle fiche d&apos;objectifs
            </button>
            {error && <div className="text-xs text-er">{error}</div>}
          </form>

          {equipeFiches.length === 0 ? (
            <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-xs text-gm">
              Aucune fiche créée pour votre équipe pour le moment.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {equipeFiches.map((e) => (
                <FicheObjectifs
                  key={e.id}
                  evaluation={e}
                  viewer="manager"
                  onChange={updateEquipe}
                  onDelete={removeEquipe}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
