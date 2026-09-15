"use client";

import { useMemo, useState } from "react";
import {
  ObjectifsEditorTable,
  STATUT_SUIVI_LABEL,
  type ObjectifLigneInput,
  type StatutSuivi,
} from "@/components/ObjectifsEditorTable";
import {
  SoftSkillsEditorTable,
  NIVEAU_ATTENDU_LABEL,
  type SoftSkillLigneInput,
  type CritereSoftSkill,
} from "@/components/SoftSkillsEditorTable";

export type EvaluationStatut = "brouillon" | "confirmee" | "auto_eval" | "terminee";

export interface ObjectifLigne extends ObjectifLigneInput {
  autoScoreAtteint: number | null;
  autoCommentaire: string | null;
  scoreAtteint: number | null;
  managerCommentaire: string | null;
}

export interface SoftSkillLigne extends SoftSkillLigneInput {
  autoScoreAtteint: number | null;
  autoCommentaire: string | null;
  scoreAtteint: number | null;
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
  softSkills: SoftSkillLigne[];
  commentaireManager: string | null;
  scoreGlobal: number | null;
  estTest: boolean;
  createdAt: string;
  updatedAt: string;
}

const STATUT_LABEL: Record<EvaluationStatut, { label: string; bg: string; fg: string }> = {
  brouillon: { label: "Brouillon", bg: "#F5F5F5", fg: "#666" },
  confirmee: { label: "Objectifs confirmés", bg: "#EEF0F8", fg: "#3A2A6A" },
  auto_eval: { label: "Auto-évaluation reçue", bg: "#FFF8EC", fg: "#7A4A00" },
  terminee: { label: "Terminée", bg: "#E6FAF4", fg: "#0A5C3A" },
};

async function patch(id: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(`/api/evaluations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

export function FicheObjectifs({
  evaluation,
  viewer,
  criteresCatalogue,
  campagneOuverte,
  onChange,
  onDelete,
}: {
  evaluation: Evaluation;
  viewer: "manager" | "employe" | "rh";
  criteresCatalogue: CritereSoftSkill[];
  campagneOuverte: boolean;
  onChange: (updated: Evaluation) => void;
  onDelete?: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poste, setPoste] = useState(evaluation.poste);
  const [departement, setDepartement] = useState(evaluation.departement);
  const [objectifs, setObjectifs] = useState<ObjectifLigne[]>(evaluation.objectifs);
  const [softSkills, setSoftSkills] = useState<SoftSkillLigne[]>(evaluation.softSkills);
  const [commentaireManager, setCommentaireManager] = useState(evaluation.commentaireManager ?? "");

  const isManagerOrRh = viewer === "manager" || viewer === "rh";
  const isBrouillon = evaluation.statut === "brouillon";
  const canEditContenu = isManagerOrRh && isBrouillon;
  const canAutoEval = viewer === "employe" && campagneOuverte && evaluation.statut !== "terminee" && evaluation.statut !== "brouillon";
  const canNotate = isManagerOrRh && campagneOuverte && evaluation.statut !== "brouillon" && evaluation.statut !== "terminee";
  const showPonderationEtScores = isManagerOrRh || evaluation.statut === "terminee";

  const total = useMemo(
    () => [...objectifs, ...softSkills].reduce((s, o) => s + (Number(o.ponderation) || 0), 0),
    [objectifs, softSkills]
  );

  // ObjectifsEditorTable/SoftSkillsEditorTable only know about the plain
  // "input" shape (no score fields, since those don't exist yet on a
  // brouillon) — these wrappers restore each line's score fields (already
  // null while brouillon) when the editor hands back its edited array.
  function onObjectifsEdited(next: ObjectifLigneInput[]) {
    setObjectifs(
      next.map((o) => {
        const existing = objectifs.find((x) => x.id === o.id);
        return {
          ...o,
          autoScoreAtteint: existing?.autoScoreAtteint ?? null,
          autoCommentaire: existing?.autoCommentaire ?? null,
          scoreAtteint: existing?.scoreAtteint ?? null,
          managerCommentaire: existing?.managerCommentaire ?? null,
        };
      })
    );
  }
  function onSoftSkillsEdited(next: SoftSkillLigneInput[]) {
    setSoftSkills(
      next.map((sInput) => {
        const existing = softSkills.find((x) => x.id === sInput.id);
        return {
          ...sInput,
          autoScoreAtteint: existing?.autoScoreAtteint ?? null,
          autoCommentaire: existing?.autoCommentaire ?? null,
          scoreAtteint: existing?.scoreAtteint ?? null,
          managerCommentaire: existing?.managerCommentaire ?? null,
        };
      })
    );
  }

  async function saveContenu(): Promise<boolean> {
    setSaving(true);
    setError(null);
    const { ok, data } = await patch(evaluation.id, { action: "contenu", poste, departement, objectifs, softSkills });
    setSaving(false);
    if (!ok) {
      setError((data as { error?: string }).error ?? "Échec de l'enregistrement");
      return false;
    }
    onChange(data as Evaluation);
    return true;
  }

  async function confirmer() {
    if (Math.abs(total - 100) > 0.5) {
      setError(`La pondération totale doit être égale à 100% (actuellement ${Math.round(total * 10) / 10}%)`);
      return;
    }
    const saved = await saveContenu();
    if (!saved) return;
    setSaving(true);
    setError(null);
    const { ok, data } = await patch(evaluation.id, { action: "confirmer" });
    setSaving(false);
    if (!ok) return setError((data as { error?: string }).error ?? "Échec");
    onChange(data as Evaluation);
  }

  async function changeStatutSuivi(objectifId: string, statutSuivi: StatutSuivi) {
    setObjectifs((prev) => prev.map((o) => (o.id === objectifId ? { ...o, statutSuivi } : o)));
    const { ok, data } = await patch(evaluation.id, { action: "statut_suivi", objectifId, statutSuivi });
    if (ok) onChange(data as Evaluation);
  }

  async function submitAutoEval() {
    setSaving(true);
    setError(null);
    const { ok, data } = await patch(evaluation.id, {
      action: "auto_eval",
      objectifs: objectifs.map((o) => ({ id: o.id, autoScoreAtteint: o.autoScoreAtteint, autoCommentaire: o.autoCommentaire })),
      softSkills: softSkills.map((s) => ({ id: s.id, autoScoreAtteint: s.autoScoreAtteint, autoCommentaire: s.autoCommentaire })),
    });
    setSaving(false);
    if (!ok) return setError((data as { error?: string }).error ?? "Échec");
    onChange(data as Evaluation);
  }

  async function finaliserNotation() {
    if ([...objectifs, ...softSkills].some((l) => l.scoreAtteint == null)) {
      setError("Indiquez un score atteint pour chaque ligne avant de finaliser.");
      return;
    }
    setSaving(true);
    setError(null);
    const { ok, data } = await patch(evaluation.id, {
      action: "notation",
      objectifs: objectifs.map((o) => ({ id: o.id, scoreAtteint: o.scoreAtteint, managerCommentaire: o.managerCommentaire })),
      softSkills: softSkills.map((s) => ({ id: s.id, scoreAtteint: s.scoreAtteint, managerCommentaire: s.managerCommentaire })),
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
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-nb">
            {evaluation.employeNom} — {evaluation.annee}
            {evaluation.estTest && (
              <span className="rounded-full bg-wn/15 px-2 py-0.5 text-[10px] font-semibold text-[#7A4A00]">
                FICHE TEST
              </span>
            )}
          </div>
          <div className="text-[11px] text-gm">
            {poste || "Poste non renseigné"} · {departement || "Département non renseigné"} · Responsable :{" "}
            {evaluation.responsableNom}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {evaluation.scoreGlobal != null && (
            <span className="font-mono text-sm font-semibold text-v">{evaluation.scoreGlobal}%</span>
          )}
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: s.bg, color: s.fg }}>
            {s.label}
          </span>
          {isBrouillon && isManagerOrRh && onDelete && (
            <button onClick={remove} className="text-[11px] text-er hover:underline">
              Supprimer
            </button>
          )}
        </div>
      </div>

      {canEditContenu && (
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

      {canEditContenu ? (
        <>
          <div className="mb-1 text-xs font-semibold text-gd">Objectifs (80%)</div>
          <ObjectifsEditorTable objectifs={objectifs} onChange={onObjectifsEdited} />
          <div className="mb-1 mt-4 text-xs font-semibold text-gd">Soft skills (20%)</div>
          <SoftSkillsEditorTable softSkills={softSkills} onChange={onSoftSkillsEdited} catalogue={criteresCatalogue} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className={`text-xs font-semibold ${total === 100 ? "text-sc" : "text-er"}`}>
              Total pondération : {Math.round(total * 10) / 10}% / 100%
            </span>
            <div className="flex gap-2">
              <button
                onClick={saveContenu}
                disabled={saving}
                className="rounded-lg border border-v/20 px-3 py-1.5 text-xs font-medium text-nb hover:bg-gl disabled:opacity-60"
              >
                Enregistrer le brouillon
              </button>
              <button
                onClick={confirmer}
                disabled={saving || objectifs.length === 0}
                className="rounded-lg bg-v px-3 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
              >
                Confirmer et transmettre au collaborateur
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <ReadOnlyTables
            objectifs={objectifs}
            softSkills={softSkills}
            viewer={viewer}
            showPonderationEtScores={showPonderationEtScores}
            canEditStatutSuivi={isManagerOrRh}
            onStatutSuiviChange={changeStatutSuivi}
            canAutoEval={canAutoEval}
            canNotate={canNotate}
            onObjectifsChange={setObjectifs}
            onSoftSkillsChange={setSoftSkills}
          />

          {!campagneOuverte && evaluation.statut !== "terminee" && (
            <div className="mt-3 rounded-lg bg-bg px-3 py-2 text-[11px] text-gm">
              {viewer === "employe"
                ? "L'auto-évaluation sera disponible dès que la RH ouvrira la campagne d'évaluation."
                : "La notation sera possible dès que la RH ouvrira une campagne d'évaluation pour ce périmètre."}
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
        </>
      )}

      {error && <div className="mt-2 text-xs text-er">{error}</div>}
    </div>
  );
}

function ReadOnlyTables({
  objectifs,
  softSkills,
  viewer,
  showPonderationEtScores,
  canEditStatutSuivi,
  onStatutSuiviChange,
  canAutoEval,
  canNotate,
  onObjectifsChange,
  onSoftSkillsChange,
}: {
  objectifs: ObjectifLigne[];
  softSkills: SoftSkillLigne[];
  viewer: "manager" | "employe" | "rh";
  showPonderationEtScores: boolean;
  canEditStatutSuivi: boolean;
  onStatutSuiviChange: (objectifId: string, statutSuivi: StatutSuivi) => void;
  canAutoEval: boolean;
  canNotate: boolean;
  onObjectifsChange: (next: ObjectifLigne[]) => void;
  onSoftSkillsChange: (next: SoftSkillLigne[]) => void;
}) {
  function updateObjectif(id: string, patch: Partial<ObjectifLigne>) {
    onObjectifsChange(objectifs.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  function updateSoftSkill(id: string, patch: Partial<SoftSkillLigne>) {
    onSoftSkillsChange(softSkills.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  return (
    <>
      <div className="mb-1 text-xs font-semibold text-gd">Objectifs</div>
      <div className="mb-4 overflow-x-auto rounded-lg border border-v/10">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {["Axe", "Objectif", "Livrables", "KPI / Cible", "Échéance"]
                .concat(showPonderationEtScores ? ["Pondération"] : [])
                .concat(["Suivi"])
                .concat(canAutoEval || (showPonderationEtScores && objectifs.some((o) => o.autoScoreAtteint != null)) ? ["Auto-éval"] : [])
                .concat(canNotate || (showPonderationEtScores && objectifs.some((o) => o.scoreAtteint != null)) ? ["Notation manager"] : [])
                .map((h) => (
                  <th key={h} className="whitespace-nowrap px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gd">
                    {h}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {objectifs.map((o) => (
              <tr key={o.id} className="border-t border-v/5 align-top">
                <td className="px-2.5 py-2 text-nb">{o.axe || "—"}</td>
                <td className="px-2.5 py-2 text-nb">{o.objectif}</td>
                <td className="px-2.5 py-2 text-gm">{o.livrables}</td>
                <td className="px-2.5 py-2 text-gm">
                  {o.kpi}
                  {o.cible && <div className="text-[10px]">Cible : {o.cible}</div>}
                </td>
                <td className="px-2.5 py-2 text-gm">{o.echeance}</td>
                {showPonderationEtScores && <td className="px-2.5 py-2 font-medium text-nb">{o.ponderation}%</td>}
                <td className="px-2.5 py-2">
                  {canEditStatutSuivi ? (
                    <select
                      value={o.statutSuivi}
                      onChange={(e) => onStatutSuiviChange(o.id, e.target.value as StatutSuivi)}
                      className="rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                    >
                      {Object.entries(STATUT_SUIVI_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    STATUT_SUIVI_LABEL[o.statutSuivi]
                  )}
                </td>
                {(canAutoEval || (showPonderationEtScores && objectifs.some((x) => x.autoScoreAtteint != null))) && (
                  <td className="px-2.5 py-2">
                    {canAutoEval ? (
                      <ScoreCell
                        score={o.autoScoreAtteint}
                        commentaire={o.autoCommentaire}
                        onScoreChange={(v) => updateObjectif(o.id, { autoScoreAtteint: v })}
                        onCommentaireChange={(v) => updateObjectif(o.id, { autoCommentaire: v })}
                      />
                    ) : (
                      <ScoreReadOnly score={o.autoScoreAtteint} commentaire={o.autoCommentaire} />
                    )}
                  </td>
                )}
                {(canNotate || (showPonderationEtScores && objectifs.some((x) => x.scoreAtteint != null))) && (
                  <td className="px-2.5 py-2">
                    {canNotate ? (
                      <ScoreCell
                        score={o.scoreAtteint}
                        commentaire={o.managerCommentaire}
                        onScoreChange={(v) => updateObjectif(o.id, { scoreAtteint: v })}
                        onCommentaireChange={(v) => updateObjectif(o.id, { managerCommentaire: v })}
                      />
                    ) : (
                      <ScoreReadOnly score={o.scoreAtteint} commentaire={o.managerCommentaire} />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-1 text-xs font-semibold text-gd">Soft skills</div>
      <div className="overflow-x-auto rounded-lg border border-v/10">
        <table className="w-full min-w-[600px] border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {["Critère", "Comportements attendus", "Niveau attendu"]
                .concat(showPonderationEtScores ? ["Pondération"] : [])
                .concat(canAutoEval || (showPonderationEtScores && softSkills.some((s) => s.autoScoreAtteint != null)) ? ["Auto-éval"] : [])
                .concat(canNotate || (showPonderationEtScores && softSkills.some((s) => s.scoreAtteint != null)) ? ["Notation manager"] : [])
                .map((h) => (
                  <th key={h} className="whitespace-nowrap px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gd">
                    {h}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {softSkills.map((sSkill) => (
              <tr key={sSkill.id} className="border-t border-v/5 align-top">
                <td className="px-2.5 py-2 font-medium text-nb">{sSkill.libelle}</td>
                <td className="px-2.5 py-2 text-gm">{sSkill.description}</td>
                <td className="px-2.5 py-2 text-nb">{NIVEAU_ATTENDU_LABEL[sSkill.niveauAttendu]}</td>
                {showPonderationEtScores && <td className="px-2.5 py-2 font-medium text-nb">{sSkill.ponderation}%</td>}
                {(canAutoEval || (showPonderationEtScores && softSkills.some((x) => x.autoScoreAtteint != null))) && (
                  <td className="px-2.5 py-2">
                    {canAutoEval ? (
                      <ScoreCell
                        score={sSkill.autoScoreAtteint}
                        commentaire={sSkill.autoCommentaire}
                        onScoreChange={(v) => updateSoftSkill(sSkill.id, { autoScoreAtteint: v })}
                        onCommentaireChange={(v) => updateSoftSkill(sSkill.id, { autoCommentaire: v })}
                      />
                    ) : (
                      <ScoreReadOnly score={sSkill.autoScoreAtteint} commentaire={sSkill.autoCommentaire} />
                    )}
                  </td>
                )}
                {(canNotate || (showPonderationEtScores && softSkills.some((x) => x.scoreAtteint != null))) && (
                  <td className="px-2.5 py-2">
                    {canNotate ? (
                      <ScoreCell
                        score={sSkill.scoreAtteint}
                        commentaire={sSkill.managerCommentaire}
                        onScoreChange={(v) => updateSoftSkill(sSkill.id, { scoreAtteint: v })}
                        onCommentaireChange={(v) => updateSoftSkill(sSkill.id, { managerCommentaire: v })}
                      />
                    ) : (
                      <ScoreReadOnly score={sSkill.scoreAtteint} commentaire={sSkill.managerCommentaire} />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewer === "employe" && !showPonderationEtScores && (
        <p className="mt-2 text-[10px] text-gm">
          Les pondérations ne sont visibles que par votre manager et la RH.
        </p>
      )}
    </>
  );
}

function ScoreCell({
  score,
  commentaire,
  onScoreChange,
  onCommentaireChange,
}: {
  score: number | null;
  commentaire: string | null;
  onScoreChange: (v: number | null) => void;
  onCommentaireChange: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <input
        type="number"
        min={0}
        max={200}
        placeholder="% atteint"
        value={score ?? ""}
        onChange={(e) => onScoreChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-20 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
      />
      <textarea
        placeholder="Commentaire"
        value={commentaire ?? ""}
        onChange={(e) => onCommentaireChange(e.target.value || null)}
        rows={2}
        className="w-40 resize-none rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
      />
    </div>
  );
}

function ScoreReadOnly({ score, commentaire }: { score: number | null; commentaire: string | null }) {
  if (score == null) return <span className="text-gm">—</span>;
  return (
    <div>
      <div className="font-medium text-nb">{score}%</div>
      {commentaire && <div className="mt-0.5 text-[11px] text-gm">{commentaire}</div>}
    </div>
  );
}
