"use client";

import { useMemo, useState } from "react";

export type EvaluationStatut = "brouillon" | "assignee" | "auto_eval" | "terminee";
export type NiveauAtteinte = "non_atteint" | "partiel" | "atteint" | "depasse";

export interface ObjectifLigne {
  id: string;
  numero: number;
  categorie: string;
  objectif: string;
  livrables: string;
  indicateur: string;
  echeance: string;
  points: number;
  autoNiveau: NiveauAtteinte | null;
  autoCommentaire: string | null;
  managerNiveau: NiveauAtteinte | null;
  managerCommentaire: string | null;
}

export interface Evaluation {
  id: string;
  employeId: number;
  employeNom: string;
  poste: string;
  departement: string;
  responsableId: number | null;
  responsableNom: string;
  annee: string;
  statut: EvaluationStatut;
  objectifs: ObjectifLigne[];
  commentaireManager: string | null;
  scoreFinal: number | null;
  createdAt: string;
  updatedAt: string;
}

const STATUT_LABEL: Record<EvaluationStatut, { label: string; bg: string; fg: string }> = {
  brouillon: { label: "Brouillon", bg: "#F5F5F5", fg: "#666" },
  assignee: { label: "Objectifs assignés", bg: "#EEF0F8", fg: "#3A2A6A" },
  auto_eval: { label: "Auto-évaluation reçue", bg: "#FFF8EC", fg: "#7A4A00" },
  terminee: { label: "Terminée", bg: "#E6FAF4", fg: "#0A5C3A" },
};

const NIVEAU_LABEL: Record<NiveauAtteinte, string> = {
  non_atteint: "Non atteint (0%)",
  partiel: "Partiellement atteint (50%)",
  atteint: "Atteint (100%)",
  depasse: "Dépassé (120%)",
};

const CATEGORIES = ["Technique / métier", "Projet", "Qualité", "Organisationnel", "Managérial", "Comportemental"];

function newLigne(numero: number): ObjectifLigne {
  return {
    id: crypto.randomUUID(),
    numero,
    categorie: "",
    objectif: "",
    livrables: "",
    indicateur: "",
    echeance: "",
    points: 0,
    autoNiveau: null,
    autoCommentaire: null,
    managerNiveau: null,
    managerCommentaire: null,
  };
}

async function patch(id: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(`/api/evaluations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

/** One fiche d'objectifs, rendered differently depending on its statut and
 * who's looking at it: the manager drafts/assigns/notates, the employee
 * only ever edits their own auto-évaluation. */
export function FicheObjectifs({
  evaluation,
  viewer,
  onChange,
  onDelete,
}: {
  evaluation: Evaluation;
  viewer: "manager" | "employe" | "rh";
  onChange: (updated: Evaluation) => void;
  onDelete?: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lignes, setLignes] = useState<ObjectifLigne[]>(evaluation.objectifs);
  const [poste, setPoste] = useState(evaluation.poste);
  const [departement, setDepartement] = useState(evaluation.departement);
  const [commentaireManager, setCommentaireManager] = useState(evaluation.commentaireManager ?? "");

  const canEditObjectifs = (viewer === "manager" || viewer === "rh") && evaluation.statut === "brouillon";
  const canAutoEval = viewer === "employe" && (evaluation.statut === "assignee" || evaluation.statut === "auto_eval");
  const canNotate =
    (viewer === "manager" || viewer === "rh") &&
    (evaluation.statut === "assignee" || evaluation.statut === "auto_eval");

  const total = useMemo(() => lignes.reduce((s, o) => s + (Number(o.points) || 0), 0), [lignes]);

  function updateLigne(id: string, p: Partial<ObjectifLigne>) {
    setLignes((prev) => prev.map((o) => (o.id === id ? { ...o, ...p } : o)));
  }

  async function saveObjectifs() {
    setSaving(true);
    setError(null);
    const { ok, data } = await patch(evaluation.id, {
      action: "objectifs",
      poste,
      departement,
      objectifs: lignes,
    });
    setSaving(false);
    if (!ok) return setError((data as { error?: string }).error ?? "Échec");
    onChange(data as Evaluation);
  }

  async function assigner() {
    if (total !== 100) {
      setError(`Le total des points doit être égal à 100 (actuellement ${total})`);
      return;
    }
    setSaving(true);
    setError(null);
    const save = await patch(evaluation.id, { action: "objectifs", poste, departement, objectifs: lignes });
    if (!save.ok) {
      setSaving(false);
      return setError((save.data as { error?: string }).error ?? "Échec de l'enregistrement");
    }
    const { ok, data } = await patch(evaluation.id, { action: "assigner" });
    setSaving(false);
    if (!ok) return setError((data as { error?: string }).error ?? "Échec");
    onChange(data as Evaluation);
  }

  async function submitAutoEval() {
    setSaving(true);
    setError(null);
    const { ok, data } = await patch(evaluation.id, {
      action: "auto_eval",
      objectifs: lignes.map((o) => ({ id: o.id, autoNiveau: o.autoNiveau, autoCommentaire: o.autoCommentaire })),
    });
    setSaving(false);
    if (!ok) return setError((data as { error?: string }).error ?? "Échec");
    onChange(data as Evaluation);
  }

  async function finaliserNotation() {
    if (lignes.some((o) => !o.managerNiveau)) {
      setError("Indiquez un niveau d'atteinte pour chaque objectif avant de finaliser.");
      return;
    }
    setSaving(true);
    setError(null);
    const { ok, data } = await patch(evaluation.id, {
      action: "notation",
      objectifs: lignes.map((o) => ({ id: o.id, managerNiveau: o.managerNiveau, managerCommentaire: o.managerCommentaire })),
      commentaireManager,
    });
    setSaving(false);
    if (!ok) return setError((data as { error?: string }).error ?? "Échec");
    onChange(data as Evaluation);
  }

  async function remove() {
    if (!confirm(`Supprimer ce brouillon de fiche pour ${evaluation.employeNom} ?`)) return;
    const res = await fetch(`/api/evaluations/${evaluation.id}`, { method: "DELETE" });
    if (res.ok) onDelete?.(evaluation.id);
  }

  const s = STATUT_LABEL[evaluation.statut];

  return (
    <div className="rounded-[14px] border border-v/10 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-nb">
            {evaluation.employeNom} — {evaluation.annee}
          </div>
          <div className="text-[11px] text-gm">
            {poste || "Poste non renseigné"} · {departement || "Département non renseigné"} · Responsable :{" "}
            {evaluation.responsableNom}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {evaluation.scoreFinal != null && (
            <span className="font-mono text-sm font-semibold text-v">{evaluation.scoreFinal}/100</span>
          )}
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: s.bg, color: s.fg }}>
            {s.label}
          </span>
          {evaluation.statut === "brouillon" && canEditObjectifs && onDelete && (
            <button onClick={remove} className="text-[11px] text-er hover:underline">
              Supprimer
            </button>
          )}
        </div>
      </div>

      {canEditObjectifs && (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            placeholder="Poste"
            value={poste}
            onChange={(e) => setPoste(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
          />
          <input
            placeholder="Département"
            value={departement}
            onChange={(e) => setDepartement(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-v/10">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {["N°", "Catégorie", "Objectif", "Livrable(s)", "Indicateur", "Échéance", "Points"]
                .concat(evaluation.statut !== "brouillon" ? ["Auto-éval"] : [])
                .concat(evaluation.statut !== "brouillon" ? ["Notation"] : [])
                .map((h) => (
                  <th key={h} className="whitespace-nowrap px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gd">
                    {h}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((o) => (
              <tr key={o.id} className="border-t border-v/5 align-top">
                <td className="px-2.5 py-2 text-nb">{o.numero}</td>
                {canEditObjectifs ? (
                  <>
                    <td className="px-2.5 py-2">
                      <input
                        list="categories-objectif"
                        value={o.categorie}
                        onChange={(e) => updateLigne(o.id, { categorie: e.target.value })}
                        className="w-32 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                      />
                    </td>
                    <td className="px-2.5 py-2">
                      <textarea
                        value={o.objectif}
                        onChange={(e) => updateLigne(o.id, { objectif: e.target.value })}
                        rows={2}
                        className="w-48 resize-none rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                      />
                    </td>
                    <td className="px-2.5 py-2">
                      <textarea
                        value={o.livrables}
                        onChange={(e) => updateLigne(o.id, { livrables: e.target.value })}
                        rows={2}
                        className="w-48 resize-none rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                      />
                    </td>
                    <td className="px-2.5 py-2">
                      <input
                        value={o.indicateur}
                        onChange={(e) => updateLigne(o.id, { indicateur: e.target.value })}
                        className="w-32 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                      />
                    </td>
                    <td className="px-2.5 py-2">
                      <input
                        value={o.echeance}
                        onChange={(e) => updateLigne(o.id, { echeance: e.target.value })}
                        className="w-28 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                      />
                    </td>
                    <td className="px-2.5 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={o.points}
                          onChange={(e) => updateLigne(o.id, { points: Number(e.target.value) })}
                          className="w-16 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                        />
                        <button
                          type="button"
                          onClick={() => setLignes((prev) => prev.filter((x) => x.id !== o.id))}
                          className="text-er"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-2.5 py-2 text-nb">{o.categorie || "—"}</td>
                    <td className="px-2.5 py-2 text-nb">{o.objectif}</td>
                    <td className="px-2.5 py-2 text-gm">{o.livrables}</td>
                    <td className="px-2.5 py-2 text-gm">{o.indicateur}</td>
                    <td className="px-2.5 py-2 text-gm">{o.echeance}</td>
                    <td className="px-2.5 py-2 font-medium text-nb">{o.points}</td>
                  </>
                )}
                {evaluation.statut !== "brouillon" &&
                  (canAutoEval ? (
                    <td className="px-2.5 py-2">
                      <div className="flex flex-col gap-1">
                        <select
                          value={o.autoNiveau ?? ""}
                          onChange={(e) => updateLigne(o.id, { autoNiveau: (e.target.value || null) as NiveauAtteinte | null })}
                          className="rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                        >
                          <option value="">Niveau…</option>
                          {(Object.keys(NIVEAU_LABEL) as NiveauAtteinte[]).map((k) => (
                            <option key={k} value={k}>
                              {NIVEAU_LABEL[k]}
                            </option>
                          ))}
                        </select>
                        <textarea
                          placeholder="Commentaire"
                          value={o.autoCommentaire ?? ""}
                          onChange={(e) => updateLigne(o.id, { autoCommentaire: e.target.value })}
                          rows={2}
                          className="w-40 resize-none rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                        />
                      </div>
                    </td>
                  ) : (
                    <td className="px-2.5 py-2 text-gm">
                      {o.autoNiveau ? (
                        <div>
                          <div className="font-medium text-nb">{NIVEAU_LABEL[o.autoNiveau]}</div>
                          {o.autoCommentaire && <div className="mt-0.5 text-[11px]">{o.autoCommentaire}</div>}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                {evaluation.statut !== "brouillon" &&
                  (canNotate ? (
                    <td className="px-2.5 py-2">
                      <div className="flex flex-col gap-1">
                        <select
                          value={o.managerNiveau ?? ""}
                          onChange={(e) => updateLigne(o.id, { managerNiveau: (e.target.value || null) as NiveauAtteinte | null })}
                          className="rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                        >
                          <option value="">Niveau…</option>
                          {(Object.keys(NIVEAU_LABEL) as NiveauAtteinte[]).map((k) => (
                            <option key={k} value={k}>
                              {NIVEAU_LABEL[k]}
                            </option>
                          ))}
                        </select>
                        <textarea
                          placeholder="Commentaire"
                          value={o.managerCommentaire ?? ""}
                          onChange={(e) => updateLigne(o.id, { managerCommentaire: e.target.value })}
                          rows={2}
                          className="w-40 resize-none rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                        />
                      </div>
                    </td>
                  ) : (
                    <td className="px-2.5 py-2 text-gm">
                      {o.managerNiveau ? (
                        <div>
                          <div className="font-medium text-nb">{NIVEAU_LABEL[o.managerNiveau]}</div>
                          {o.managerCommentaire && <div className="mt-0.5 text-[11px]">{o.managerCommentaire}</div>}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
              </tr>
            ))}
          </tbody>
          {lignes.length > 0 && (
            <tfoot>
              <tr className="border-t border-v/10 bg-bg font-semibold">
                <td colSpan={6} className="px-2.5 py-2 text-right text-[11px] text-gd">
                  Total
                </td>
                <td className={`px-2.5 py-2 ${total === 100 ? "text-sc" : "text-er"}`}>{total}/100</td>
              </tr>
            </tfoot>
          )}
        </table>
        <datalist id="categories-objectif">
          {CATEGORIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {canEditObjectifs && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setLignes((prev) => [...prev, newLigne(prev.length + 1)])}
            className="text-xs font-medium text-v hover:underline"
          >
            + Ajouter un objectif
          </button>
          <div className="flex gap-2">
            <button
              onClick={saveObjectifs}
              disabled={saving}
              className="rounded-lg border border-v/20 px-3 py-1.5 text-xs font-medium text-nb hover:bg-gl disabled:opacity-60"
            >
              Enregistrer le brouillon
            </button>
            <button
              onClick={assigner}
              disabled={saving || lignes.length === 0}
              className="rounded-lg bg-v px-3 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
            >
              Assigner au collaborateur
            </button>
          </div>
        </div>
      )}

      {canAutoEval && (
        <div className="mt-3 flex justify-end">
          <button
            onClick={submitAutoEval}
            disabled={saving}
            className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
          >
            {evaluation.statut === "auto_eval" ? "Mettre à jour mon auto-évaluation" : "Soumettre mon auto-évaluation"}
          </button>
        </div>
      )}

      {canNotate && (
        <div className="mt-3">
          <textarea
            placeholder="Commentaire général (entretien)"
            value={commentaireManager}
            onChange={(e) => setCommentaireManager(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={finaliserNotation}
              disabled={saving}
              className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
            >
              Finaliser la notation
            </button>
          </div>
        </div>
      )}

      {evaluation.statut === "terminee" && evaluation.commentaireManager && (
        <div className="mt-3 rounded-lg bg-bg p-2.5 text-[11px] text-gd">{evaluation.commentaireManager}</div>
      )}

      {error && <div className="mt-2 text-xs text-er">{error}</div>}
    </div>
  );
}
