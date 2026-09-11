"use client";

import { useEffect, useMemo, useState } from "react";
import { initials } from "@/lib/format";

export type EvaluationStatut = "planifiee" | "en_cours" | "terminee";
export type ObjectifStatut = "a_faire" | "en_cours" | "atteint" | "non_atteint";

export interface Objectif {
  id: string;
  titre: string;
  description: string;
  statut: ObjectifStatut;
}

export interface Evaluation {
  id: string;
  employeId: number;
  employeNom: string;
  periode: string;
  statut: EvaluationStatut;
  evaluateur: string;
  score: number | null;
  commentaire: string | null;
  objectifs: Objectif[];
  createdAt: string;
  updatedAt: string;
}

interface EmployeOption {
  id: number;
  fullname: string;
  entite: string;
  fonction: string;
}

const STATUT_LABEL: Record<EvaluationStatut, { label: string; bg: string; fg: string }> = {
  planifiee: { label: "Planifiée", bg: "#EEF0F8", fg: "#3A2A6A" },
  en_cours: { label: "En cours", bg: "#FFF8EC", fg: "#7A4A00" },
  terminee: { label: "Terminée", bg: "#E6FAF4", fg: "#0A5C3A" },
};

const OBJECTIF_LABEL: Record<ObjectifStatut, { label: string; bg: string; fg: string }> = {
  a_faire: { label: "À faire", bg: "#F5F5F5", fg: "#666" },
  en_cours: { label: "En cours", bg: "#FFF8EC", fg: "#7A4A00" },
  atteint: { label: "Atteint", bg: "#E6FAF4", fg: "#0A5C3A" },
  non_atteint: { label: "Non atteint", bg: "#FDECEA", fg: "#8B1A1A" },
};

const TABS: { key: EvaluationStatut | ""; label: string }[] = [
  { key: "", label: "Toutes" },
  { key: "planifiee", label: "Planifiées" },
  { key: "en_cours", label: "En cours" },
  { key: "terminee", label: "Terminées" },
];

function newObjectif(): Objectif {
  return { id: crypto.randomUUID(), titre: "", description: "", statut: "a_faire" };
}

export function EvaluationsBoard({
  initialEvaluations,
  currentUserName,
  dbEnabled,
}: {
  initialEvaluations: Evaluation[];
  currentUserName: string;
  dbEnabled: boolean;
}) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>(initialEvaluations);
  const [tab, setTab] = useState<EvaluationStatut | "">("");
  const [employes, setEmployes] = useState<EmployeOption[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Evaluation | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employeId, setEmployeId] = useState("");
  const [periode, setPeriode] = useState("");
  const [evaluateur, setEvaluateur] = useState(currentUserName);
  const [statut, setStatut] = useState<EvaluationStatut>("planifiee");
  const [score, setScore] = useState("");
  const [commentaire, setCommentaire] = useState("");
  const [objectifs, setObjectifs] = useState<Objectif[]>([]);

  useEffect(() => {
    fetch("/api/search/index")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setEmployes(data))
      .catch(() => {});
  }, []);

  const filtered = useMemo(
    () => (tab ? evaluations.filter((e) => e.statut === tab) : evaluations),
    [evaluations, tab]
  );

  function openCreate() {
    setEditing(null);
    setEmployeId("");
    setPeriode("");
    setEvaluateur(currentUserName);
    setStatut("planifiee");
    setScore("");
    setCommentaire("");
    setObjectifs([newObjectif()]);
    setShowForm(true);
  }

  function openEdit(e: Evaluation) {
    setEditing(e);
    setEmployeId(String(e.employeId));
    setPeriode(e.periode);
    setEvaluateur(e.evaluateur);
    setStatut(e.statut);
    setScore(e.score != null ? String(e.score) : "");
    setCommentaire(e.commentaire ?? "");
    setObjectifs(e.objectifs.length ? e.objectifs : [newObjectif()]);
    setShowForm(true);
  }

  async function removeEvaluation(e: Evaluation) {
    if (!confirm(`Supprimer l'évaluation de ${e.employeNom} (${e.periode}) ?`)) return;
    const res = await fetch(`/api/evaluations/${e.id}`, { method: "DELETE" });
    if (res.ok) setEvaluations((prev) => prev.filter((x) => x.id !== e.id));
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    const cleanObjectifs = objectifs.filter((o) => o.titre.trim());
    setSaving(true);
    try {
      if (editing) {
        const res = await fetch(`/api/evaluations/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periode,
            statut,
            evaluateur,
            score: score === "" ? null : Number(score),
            commentaire: commentaire || null,
            objectifs: cleanObjectifs,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Échec");
        const updated = await res.json();
        setEvaluations((prev) => prev.map((x) => (x.id === editing.id ? updated : x)));
      } else {
        const emp = employes?.find((e) => String(e.id) === employeId);
        if (!emp) throw new Error("Sélectionnez un collaborateur");
        const res = await fetch("/api/evaluations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeId: emp.id,
            employeNom: emp.fullname,
            periode,
            evaluateur,
            objectifs: cleanObjectifs,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Échec");
        const created = await res.json();
        setEvaluations((prev) => [created, ...prev]);
      }
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSaving(false);
    }
  }

  function updateObjectif(id: string, patch: Partial<Objectif>) {
    setObjectifs((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  if (!dbEnabled) {
    return (
      <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center">
        <div className="mb-1 text-sm font-semibold text-nb">Base de données non configurée</div>
        <p className="mx-auto max-w-md text-xs text-gm">
          Le module Évaluations a besoin d&apos;une base Postgres (Neon) — Neos ne fournit aucune
          ressource d&apos;évaluation. Ajoutez <code>DATABASE_URL</code> dans les variables
          d&apos;environnement du projet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-0.5 rounded-[10px] bg-bg2 p-1">
          {TABS.map((t) => (
            <button
              key={t.key || "all"}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                tab === t.key ? "bg-white text-v shadow-sm" : "text-gm hover:text-nb"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={openCreate}
          className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm"
        >
          + Nouvelle évaluation
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((e) => {
          const atteints = e.objectifs.filter((o) => o.statut === "atteint").length;
          const s = STATUT_LABEL[e.statut];
          return (
            <div key={e.id} className="rounded-[14px] border border-v/10 bg-white p-4">
              <div className="mb-2 flex items-start gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v text-xs font-semibold text-white">
                  {initials(e.employeNom)}
                </div>
                <button onClick={() => openEdit(e)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-[13px] font-medium text-nb hover:underline">
                    {e.employeNom}
                  </div>
                  <div className="text-[11px] text-gm">{e.periode}</div>
                </button>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: s.bg, color: s.fg }}
                >
                  {s.label}
                </span>
              </div>
              <div className="mb-2 flex items-center justify-between text-xs text-gm">
                <span>
                  Objectifs : {atteints}/{e.objectifs.length} atteints
                </span>
                {e.score != null && <span className="font-mono font-semibold text-v">{e.score}/5</span>}
              </div>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-bg2">
                <div
                  className="h-full rounded-full bg-sc"
                  style={{
                    width: `${e.objectifs.length ? (atteints / e.objectifs.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-gm">
                <span>Évaluateur : {e.evaluateur}</span>
                <button onClick={() => removeEvaluation(e)} className="text-er hover:underline">
                  Supprimer
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-[14px] border border-v/10 bg-white p-8 text-center text-sm text-gm">
            Aucune évaluation dans cette catégorie.
          </div>
        )}
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-vd/50 p-4"
          onClick={() => setShowForm(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[14px] bg-white p-5"
          >
            <div className="mb-4 text-sm font-semibold text-nb">
              {editing ? `Évaluation — ${editing.employeNom}` : "Nouvelle évaluation"}
            </div>

            <div className="flex flex-col gap-3">
              {!editing && (
                <select
                  required
                  value={employeId}
                  onChange={(ev) => setEmployeId(ev.target.value)}
                  className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
                >
                  <option value="">Collaborateur…</option>
                  {employes?.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullname} — {e.fonction}
                    </option>
                  ))}
                </select>
              )}
              <input
                required
                placeholder="Période (ex: S1 2026)"
                value={periode}
                onChange={(e) => setPeriode(e.target.value)}
                className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              />
              <input
                placeholder="Évaluateur"
                value={evaluateur}
                onChange={(e) => setEvaluateur(e.target.value)}
                className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              />

              {editing && (
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={statut}
                    onChange={(e) => setStatut(e.target.value as EvaluationStatut)}
                    className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
                  >
                    {Object.entries(STATUT_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    placeholder="Score /5"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
                  />
                </div>
              )}

              <textarea
                placeholder="Commentaire général"
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                rows={2}
                className="resize-none rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              />

              <div className="mt-1">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gd">Objectifs</span>
                  <button
                    type="button"
                    onClick={() => setObjectifs((prev) => [...prev, newObjectif()])}
                    className="text-xs font-medium text-v hover:underline"
                  >
                    + Ajouter
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {objectifs.map((o) => (
                    <div key={o.id} className="rounded-lg border border-v/10 bg-bg p-2.5">
                      <div className="mb-1.5 flex gap-2">
                        <input
                          placeholder="Titre de l'objectif"
                          value={o.titre}
                          onChange={(e) => updateObjectif(o.id, { titre: e.target.value })}
                          className="min-w-0 flex-1 rounded-md border border-v/15 bg-white px-2 py-1 text-xs outline-none focus:border-v"
                        />
                        <select
                          value={o.statut}
                          onChange={(e) =>
                            updateObjectif(o.id, { statut: e.target.value as ObjectifStatut })
                          }
                          className="rounded-md border border-v/15 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-v"
                        >
                          {Object.entries(OBJECTIF_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setObjectifs((prev) => prev.filter((x) => x.id !== o.id))
                          }
                          className="shrink-0 text-xs text-er"
                        >
                          ×
                        </button>
                      </div>
                      <input
                        placeholder="Description (optionnel)"
                        value={o.description}
                        onChange={(e) => updateObjectif(o.id, { description: e.target.value })}
                        className="w-full rounded-md border border-v/15 bg-white px-2 py-1 text-[11px] outline-none focus:border-v"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && <div className="mt-3 text-xs text-er">{error}</div>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-v/20 px-3.5 py-1.5 text-xs font-medium text-nb hover:bg-gl"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
              >
                {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Créer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
