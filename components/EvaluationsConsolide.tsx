"use client";

import { useMemo, useState } from "react";
import { FicheObjectifs, type Evaluation, type EvaluationStatut } from "@/components/FicheObjectifs";

interface EmployeOption {
  id: number;
  fullname: string;
  entite: string;
  fonction: string;
}

const STATUT_LABEL: Record<EvaluationStatut, string> = {
  brouillon: "Brouillon",
  assignee: "Objectifs assignés",
  auto_eval: "Auto-évaluation reçue",
  terminee: "Terminée",
};

/** RH's oversight view — the "Consolidé" equivalent from the modèle Excel:
 * one row per fiche across the whole org, filterable, with drill-in detail.
 * RH can also create a fiche on anyone's behalf (e.g. when a manager asks
 * for help, or to unblock a hierarchy gap). */
export function EvaluationsConsolide({
  initialEvaluations,
  employes,
}: {
  initialEvaluations: Evaluation[];
  employes: EmployeOption[];
}) {
  const [evaluations, setEvaluations] = useState(initialEvaluations);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employeId, setEmployeId] = useState("");
  const [annee, setAnnee] = useState(String(new Date().getFullYear()));

  const [filtreAnnee, setFiltreAnnee] = useState("");
  const [filtreDepartement, setFiltreDepartement] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<EvaluationStatut | "">("");

  const annees = useMemo(() => Array.from(new Set(evaluations.map((e) => e.annee))).sort().reverse(), [evaluations]);
  const departements = useMemo(
    () => Array.from(new Set(evaluations.map((e) => e.departement).filter(Boolean))).sort(),
    [evaluations]
  );

  const filtered = evaluations.filter(
    (e) =>
      (!filtreAnnee || e.annee === filtreAnnee) &&
      (!filtreDepartement || e.departement === filtreDepartement) &&
      (!filtreStatut || e.statut === filtreStatut)
  );

  function update(updated: Evaluation) {
    setEvaluations((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function remove(id: string) {
    setEvaluations((prev) => prev.filter((e) => e.id !== id));
    setOpenId(null);
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
    setEvaluations((prev) => [data as Evaluation, ...prev]);
    setEmployeId("");
    setShowCreate(false);
    setOpenId((data as Evaluation).id);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={filtreAnnee}
            onChange={(e) => setFiltreAnnee(e.target.value)}
            className="rounded-lg border border-v/15 bg-white px-3 py-1.5 text-xs outline-none focus:border-v"
          >
            <option value="">Toutes années</option>
            {annees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={filtreDepartement}
            onChange={(e) => setFiltreDepartement(e.target.value)}
            className="rounded-lg border border-v/15 bg-white px-3 py-1.5 text-xs outline-none focus:border-v"
          >
            <option value="">Tous départements</option>
            {departements.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value as EvaluationStatut | "")}
            className="rounded-lg border border-v/15 bg-white px-3 py-1.5 text-xs outline-none focus:border-v"
          >
            <option value="">Tous statuts</option>
            {(Object.keys(STATUT_LABEL) as EvaluationStatut[]).map((s) => (
              <option key={s} value={s}>
                {STATUT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm"
        >
          + Nouvelle fiche
        </button>
      </div>

      {showCreate && (
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
              className="min-w-[220px] rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
            >
              <option value="">Sélectionner…</option>
              {employes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullname} — {e.fonction}
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
            Créer le brouillon
          </button>
          {error && <div className="text-xs text-er">{error}</div>}
        </form>
      )}

      <div className="overflow-hidden rounded-[14px] border border-v/10 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {["Collaborateur", "Poste", "Département", "Responsable", "Année", "Statut", "Score"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr
                key={e.id}
                onClick={() => setOpenId(openId === e.id ? null : e.id)}
                className="cursor-pointer border-b border-v/5 last:border-none hover:bg-gl"
              >
                <td className="px-3.5 py-2.5 font-medium text-nb">{e.employeNom}</td>
                <td className="px-3.5 py-2.5 text-nb">{e.poste || "—"}</td>
                <td className="px-3.5 py-2.5 text-nb">{e.departement || "—"}</td>
                <td className="px-3.5 py-2.5 text-nb">{e.responsableNom}</td>
                <td className="px-3.5 py-2.5 text-nb">{e.annee}</td>
                <td className="px-3.5 py-2.5 text-nb">{STATUT_LABEL[e.statut]}</td>
                <td className="px-3.5 py-2.5 font-mono text-nb">{e.scoreFinal != null ? `${e.scoreFinal}/100` : "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3.5 py-8 text-center text-gm">
                  Aucune fiche pour ces filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openId && (
        <div className="mt-4">
          {(() => {
            const e = evaluations.find((x) => x.id === openId);
            if (!e) return null;
            return <FicheObjectifs evaluation={e} viewer="rh" onChange={update} onDelete={remove} />;
          })()}
        </div>
      )}
    </div>
  );
}
