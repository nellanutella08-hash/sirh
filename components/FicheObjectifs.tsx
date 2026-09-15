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

export const SATISFACTION_NIVEAUX = ["tres_insatisfait", "insatisfait", "neutre", "satisfait", "tres_satisfait"] as const;
export type SatisfactionNiveau = (typeof SATISFACTION_NIVEAUX)[number];

const SATISFACTION_LABEL: Record<SatisfactionNiveau, string> = {
  tres_insatisfait: "Très insatisfait",
  insatisfait: "Insatisfait",
  neutre: "Neutre",
  satisfait: "Satisfait",
  tres_satisfait: "Très satisfait",
};

export interface QuestionsGenerales {
  relationsCollegues: SatisfactionNiveau | null;
  communicationHierarchie: SatisfactionNiveau | null;
  satisfactionPoste: SatisfactionNiveau | null;
  equilibreVieProPerso: SatisfactionNiveau | null;
  epanouissement: SatisfactionNiveau | null;
  besoinsFormation: string | null;
  suggestions: string | null;
  autresCommentaires: string | null;
}

const QUESTIONS_GENERALES_VIDE: QuestionsGenerales = {
  relationsCollegues: null,
  communicationHierarchie: null,
  satisfactionPoste: null,
  equilibreVieProPerso: null,
  epanouissement: null,
  besoinsFormation: null,
  suggestions: null,
  autresCommentaires: null,
};

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
  questionsGenerales: QuestionsGenerales | null;
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

export type TabKey = "fiche" | "auto_eval" | "notation";

/** One collapsed-by-default block within a tab's content (Objectifs / Soft
 * skills / Environnement de travail / Commentaire…) — click to open. Keeps
 * a fiche from turning into one long uninterrupted scroll once it has more
 * than a couple of lines. */
function Section({
  title,
  count,
  defaultOpen,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-v/10 last:mb-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-bg px-3 py-2 text-left hover:bg-gl"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gd">
          {title}
          {count != null && (
            <span className="rounded-full bg-bg2 px-1.5 py-0.5 text-[10px] font-semibold text-gm">{count}</span>
          )}
        </span>
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
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}

export function FicheObjectifs({
  evaluation,
  viewer,
  criteresCatalogue,
  campagneOuverte,
  onChange,
  onDelete,
  preferredTab,
  collapsible,
  defaultOpen,
}: {
  evaluation: Evaluation;
  viewer: "manager" | "employe" | "rh";
  criteresCatalogue: CritereSoftSkill[];
  campagneOuverte: boolean;
  onChange: (updated: Evaluation) => void;
  onDelete?: (id: string) => void;
  /** Forces which internal tab is shown first when the fiche is opened —
   * used by the "Campagnes" view to land directly on auto-éval/notation
   * instead of the plain reference tab. Falls back silently if that tab
   * isn't actually available yet (e.g. no campagne ouverte). */
  preferredTab?: TabKey;
  /** Renders the header as a click-to-expand toggle and hides the body
   * until opened — used everywhere a list can hold many fiches at once,
   * so the page doesn't turn into one long scroll of expanded cards. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poste, setPoste] = useState(evaluation.poste);
  const [departement, setDepartement] = useState(evaluation.departement);
  const [objectifs, setObjectifs] = useState<ObjectifLigne[]>(evaluation.objectifs);
  const [softSkills, setSoftSkills] = useState<SoftSkillLigne[]>(evaluation.softSkills);
  const [commentaireManager, setCommentaireManager] = useState(evaluation.commentaireManager ?? "");
  const [questionsGenerales, setQuestionsGenerales] = useState<QuestionsGenerales>(
    evaluation.questionsGenerales ?? QUESTIONS_GENERALES_VIDE
  );

  const isManagerOrRh = viewer === "manager" || viewer === "rh";
  const isBrouillon = evaluation.statut === "brouillon";
  const canEditContenu = isManagerOrRh && isBrouillon;
  const canAutoEval = viewer === "employe" && campagneOuverte && evaluation.statut !== "terminee" && evaluation.statut !== "brouillon";
  const canNotate = isManagerOrRh && campagneOuverte && evaluation.statut !== "brouillon" && evaluation.statut !== "terminee";
  const showPonderationEtScores = isManagerOrRh || evaluation.statut === "terminee";

  const hasAutoEvalTab =
    !isBrouillon &&
    ((viewer === "employe" && (canAutoEval || evaluation.statut === "auto_eval" || evaluation.statut === "terminee")) ||
      (isManagerOrRh && (evaluation.statut === "auto_eval" || evaluation.statut === "terminee")));
  const hasNotationTab = !isBrouillon && isManagerOrRh && (canNotate || evaluation.statut === "terminee");

  const [tab, setTab] = useState<TabKey>(() => {
    if (canEditContenu) return "fiche";
    if (preferredTab === "auto_eval" && hasAutoEvalTab) return "auto_eval";
    if (preferredTab === "notation" && hasNotationTab) return "notation";
    if (preferredTab === "fiche") return "fiche";
    if (viewer === "employe" && canAutoEval) return "auto_eval";
    if (isManagerOrRh && canNotate) return "notation";
    return "fiche";
  });
  const [open, setOpen] = useState(defaultOpen ?? !collapsible);

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
      questionsGenerales,
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
  const canEditAutoEval = viewer === "employe" && canAutoEval;
  const canEditNotation = isManagerOrRh && canNotate;

  const tabs: { key: TabKey; label: string }[] = [{ key: "fiche", label: "📋 Fiche d'objectifs" }];
  if (hasAutoEvalTab) {
    tabs.push({ key: "auto_eval", label: viewer === "employe" ? "✍️ Mon auto-évaluation" : "✍️ Auto-évaluation reçue" });
  }
  if (hasNotationTab) {
    tabs.push({ key: "notation", label: "📝 Ma notation" });
  }

  const highlightRing =
    evaluation.statut === "terminee"
      ? "ring-1 ring-sc/25"
      : evaluation.statut === "auto_eval" && isManagerOrRh
        ? "ring-1 ring-wn/40"
        : "";

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-2">
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              remove();
            }}
            className="text-[11px] text-er hover:underline"
          >
            Supprimer
          </button>
        )}
        {collapsible && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={`shrink-0 text-gm transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </div>
    </div>
  );

  return (
    <div className={`rounded-[14px] border border-v/10 bg-white p-4 ${highlightRing}`}>
      {collapsible ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
          className="w-full cursor-pointer text-left"
        >
          {header}
        </div>
      ) : (
        <div className="mb-3">{header}</div>
      )}

      {!open ? null : (
        <>
          <div className="mt-3" />
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
          {tabs.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5 border-b border-v/10 pb-2">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    tab === t.key ? "bg-v text-white" : "bg-bg2 text-gm hover:text-nb"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {tab === "fiche" && (
            <ObjectifsReferenceView
              objectifs={objectifs}
              softSkills={softSkills}
              showPonderation={showPonderationEtScores}
              canEditStatutSuivi={isManagerOrRh}
              onStatutSuiviChange={changeStatutSuivi}
            />
          )}

          {tab === "auto_eval" && hasAutoEvalTab && (
            <AutoEvalPanel
              objectifs={objectifs}
              softSkills={softSkills}
              questionsGenerales={questionsGenerales}
              readOnly={!canEditAutoEval}
              onObjectifsChange={setObjectifs}
              onSoftSkillsChange={setSoftSkills}
              onQuestionsGeneralesChange={setQuestionsGenerales}
            />
          )}

          {tab === "notation" && hasNotationTab && (
            <NotationPanel
              objectifs={objectifs}
              softSkills={softSkills}
              readOnly={!canEditNotation}
              onObjectifsChange={setObjectifs}
              onSoftSkillsChange={setSoftSkills}
              commentaireManager={commentaireManager}
              onCommentaireManagerChange={setCommentaireManager}
            />
          )}

          {tab === "fiche" && !campagneOuverte && evaluation.statut !== "terminee" && (
            <div className="mt-3 rounded-lg bg-bg px-3 py-2 text-[11px] text-gm">
              {viewer === "employe"
                ? "L'auto-évaluation sera disponible dès que la RH ouvrira la campagne d'évaluation."
                : "La notation sera possible dès que la RH ouvrira une campagne d'évaluation pour ce périmètre."}
            </div>
          )}

          {tab === "auto_eval" && canEditAutoEval && (
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

          {tab === "notation" && canEditNotation && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={finaliserNotation}
                disabled={saving}
                className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
              >
                Finaliser la notation
              </button>
            </div>
          )}

          {evaluation.statut === "terminee" && evaluation.commentaireManager && tab === "notation" && (
            <div className="mt-3 rounded-lg bg-bg p-2.5 text-[11px] text-gd">{evaluation.commentaireManager}</div>
          )}
        </>
      )}

          {error && <div className="mt-2 text-xs text-er">{error}</div>}
        </>
      )}
    </div>
  );
}

/** Pure reference view — objectifs and soft skills as attributed, no
 * scoring columns mixed in, so it stays readable on its own instead of
 * being crammed next to the auto-éval/notation inputs. */
function ObjectifsReferenceView({
  objectifs,
  softSkills,
  showPonderation,
  canEditStatutSuivi,
  onStatutSuiviChange,
}: {
  objectifs: ObjectifLigne[];
  softSkills: SoftSkillLigne[];
  showPonderation: boolean;
  canEditStatutSuivi: boolean;
  onStatutSuiviChange: (objectifId: string, statutSuivi: StatutSuivi) => void;
}) {
  return (
    <>
      <Section title="Objectifs" count={objectifs.length} defaultOpen>
        <div className="overflow-x-auto rounded-lg border border-v/10">
          <table className="w-full min-w-[680px] border-collapse text-xs">
            <thead>
              <tr className="bg-bg">
                {["Axe", "Objectif", "Livrables", "KPI / Cible", "Échéance"]
                  .concat(showPonderation ? ["Pondération"] : [])
                  .concat(["Suivi"])
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
                  {showPonderation && <td className="px-2.5 py-2 font-medium text-nb">{o.ponderation}%</td>}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Soft skills" count={softSkills.length}>
        <div className="overflow-x-auto rounded-lg border border-v/10">
          <table className="w-full min-w-[500px] border-collapse text-xs">
            <thead>
              <tr className="bg-bg">
                {["Critère", "Comportements attendus", "Niveau attendu"].concat(showPonderation ? ["Pondération"] : []).map((h) => (
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
                  {showPonderation && <td className="px-2.5 py-2 font-medium text-nb">{sSkill.ponderation}%</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showPonderation && (
          <p className="mt-2 text-[10px] text-gm">Les pondérations ne sont visibles que par votre manager et la RH.</p>
        )}
      </Section>
    </>
  );
}

/** Auto-évaluation — one focused card per ligne (not a wide merged table)
 * plus the "questions générales" block (environnement de travail,
 * bien-être, formation), which only ever exists here: informational,
 * never scored, never touched by the manager. */
function AutoEvalPanel({
  objectifs,
  softSkills,
  questionsGenerales,
  readOnly,
  onObjectifsChange,
  onSoftSkillsChange,
  onQuestionsGeneralesChange,
}: {
  objectifs: ObjectifLigne[];
  softSkills: SoftSkillLigne[];
  questionsGenerales: QuestionsGenerales;
  readOnly: boolean;
  onObjectifsChange: (next: ObjectifLigne[]) => void;
  onSoftSkillsChange: (next: SoftSkillLigne[]) => void;
  onQuestionsGeneralesChange: (next: QuestionsGenerales) => void;
}) {
  function updateObjectif(id: string, patch: Partial<ObjectifLigne>) {
    onObjectifsChange(objectifs.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  function updateSoftSkill(id: string, patch: Partial<SoftSkillLigne>) {
    onSoftSkillsChange(softSkills.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function updateQuestion(patch: Partial<QuestionsGenerales>) {
    onQuestionsGeneralesChange({ ...questionsGenerales, ...patch });
  }

  return (
    <div>
      <Section title="Mes objectifs" count={objectifs.length} defaultOpen>
        <div className="flex flex-col gap-2">
          {objectifs.map((o) => (
            <div key={o.id} className="rounded-lg border border-v/10 bg-bg p-3">
              <div className="mb-1.5 text-[12px] font-medium text-nb">{o.objectif}</div>
              {readOnly ? (
                <ScoreReadOnly score={o.autoScoreAtteint} commentaire={o.autoCommentaire} />
              ) : (
                <ScoreCell
                  score={o.autoScoreAtteint}
                  commentaire={o.autoCommentaire}
                  onScoreChange={(v) => updateObjectif(o.id, { autoScoreAtteint: v })}
                  onCommentaireChange={(v) => updateObjectif(o.id, { autoCommentaire: v })}
                />
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Mes soft skills" count={softSkills.length}>
        <div className="flex flex-col gap-2">
          {softSkills.map((sSkill) => (
            <div key={sSkill.id} className="rounded-lg border border-v/10 bg-bg p-3">
              <div className="mb-1.5 text-[12px] font-medium text-nb">{sSkill.libelle}</div>
              {readOnly ? (
                <ScoreReadOnly score={sSkill.autoScoreAtteint} commentaire={sSkill.autoCommentaire} />
              ) : (
                <ScoreCell
                  score={sSkill.autoScoreAtteint}
                  commentaire={sSkill.autoCommentaire}
                  onScoreChange={(v) => updateSoftSkill(sSkill.id, { autoScoreAtteint: v })}
                  onCommentaireChange={(v) => updateSoftSkill(sSkill.id, { autoCommentaire: v })}
                />
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Environnement de travail & bien-être">
        <div className="flex flex-col gap-3 rounded-lg border border-v/10 bg-bg p-3">
          {(
            [
              ["relationsCollegues", "Relations avec les collègues et la hiérarchie"],
              ["communicationHierarchie", "Communication avec la hiérarchie"],
              ["satisfactionPoste", "Satisfaction dans le poste"],
              ["equilibreVieProPerso", "Équilibre vie professionnelle / personnelle"],
              ["epanouissement", "Épanouissement professionnel"],
            ] as [keyof QuestionsGenerales, string][]
          ).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[12px] text-nb">{label}</span>
              {readOnly ? (
                <span className="text-[12px] font-medium text-v">
                  {questionsGenerales[key] ? SATISFACTION_LABEL[questionsGenerales[key] as SatisfactionNiveau] : "—"}
                </span>
              ) : (
                <select
                  value={(questionsGenerales[key] as string) ?? ""}
                  onChange={(e) => updateQuestion({ [key]: e.target.value || null } as Partial<QuestionsGenerales>)}
                  className="rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-v"
                >
                  <option value="">Choisir…</option>
                  {SATISFACTION_NIVEAUX.map((n) => (
                    <option key={n} value={n}>
                      {SATISFACTION_LABEL[n]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}

          {(
            [
              ["besoinsFormation", "Besoins de formation ou d'accompagnement"],
              ["suggestions", "Suggestions pour améliorer l'environnement de travail"],
              ["autresCommentaires", "Autres commentaires"],
            ] as [keyof QuestionsGenerales, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <div className="mb-1 text-[11px] font-medium text-gd">{label}</div>
              {readOnly ? (
                <p className="text-[12px] text-nb">{(questionsGenerales[key] as string) || "—"}</p>
              ) : (
                <textarea
                  value={(questionsGenerales[key] as string) ?? ""}
                  onChange={(e) => updateQuestion({ [key]: e.target.value || null } as Partial<QuestionsGenerales>)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-v"
                />
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/** Notation — manager sees the collaborateur's auto-éval alongside their
 * own input, ligne par ligne, in its own tab rather than merged with the
 * fiche's reference columns. */
function NotationPanel({
  objectifs,
  softSkills,
  readOnly,
  onObjectifsChange,
  onSoftSkillsChange,
  commentaireManager,
  onCommentaireManagerChange,
}: {
  objectifs: ObjectifLigne[];
  softSkills: SoftSkillLigne[];
  readOnly: boolean;
  onObjectifsChange: (next: ObjectifLigne[]) => void;
  onSoftSkillsChange: (next: SoftSkillLigne[]) => void;
  commentaireManager: string;
  onCommentaireManagerChange: (v: string) => void;
}) {
  function updateObjectif(id: string, patch: Partial<ObjectifLigne>) {
    onObjectifsChange(objectifs.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  function updateSoftSkill(id: string, patch: Partial<SoftSkillLigne>) {
    onSoftSkillsChange(softSkills.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  return (
    <div>
      <Section title="Objectifs" count={objectifs.length} defaultOpen>
        <div className="flex flex-col gap-2">
          {objectifs.map((o) => (
            <div key={o.id} className="rounded-lg border border-v/10 bg-bg p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-nb">{o.objectif}</span>
                <span className="text-[10px] text-gm">{o.ponderation}%</span>
              </div>
              <div className="mb-2 rounded-md bg-white p-2">
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gm">Auto-évaluation</div>
                <ScoreReadOnly score={o.autoScoreAtteint} commentaire={o.autoCommentaire} />
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gm">Ma notation</div>
              {readOnly ? (
                <ScoreReadOnly score={o.scoreAtteint} commentaire={o.managerCommentaire} />
              ) : (
                <ScoreCell
                  score={o.scoreAtteint}
                  commentaire={o.managerCommentaire}
                  onScoreChange={(v) => updateObjectif(o.id, { scoreAtteint: v })}
                  onCommentaireChange={(v) => updateObjectif(o.id, { managerCommentaire: v })}
                />
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Soft skills" count={softSkills.length}>
        <div className="flex flex-col gap-2">
          {softSkills.map((sSkill) => (
            <div key={sSkill.id} className="rounded-lg border border-v/10 bg-bg p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium text-nb">{sSkill.libelle}</span>
                <span className="text-[10px] text-gm">{sSkill.ponderation}%</span>
              </div>
              <div className="mb-2 rounded-md bg-white p-2">
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gm">Auto-évaluation</div>
                <ScoreReadOnly score={sSkill.autoScoreAtteint} commentaire={sSkill.autoCommentaire} />
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gm">Ma notation</div>
              {readOnly ? (
                <ScoreReadOnly score={sSkill.scoreAtteint} commentaire={sSkill.managerCommentaire} />
              ) : (
                <ScoreCell
                  score={sSkill.scoreAtteint}
                  commentaire={sSkill.managerCommentaire}
                  onScoreChange={(v) => updateSoftSkill(sSkill.id, { scoreAtteint: v })}
                  onCommentaireChange={(v) => updateSoftSkill(sSkill.id, { managerCommentaire: v })}
                />
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Commentaire général (entretien)">
        {readOnly ? (
          <p className="text-[12px] text-nb">{commentaireManager || "—"}</p>
        ) : (
          <textarea
            value={commentaireManager}
            onChange={(e) => onCommentaireManagerChange(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v"
          />
        )}
      </Section>
    </div>
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
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
      <input
        type="number"
        min={0}
        max={200}
        placeholder="% atteint"
        value={score ?? ""}
        onChange={(e) => onScoreChange(e.target.value === "" ? null : Number(e.target.value))}
        onFocus={(e) => e.target.select()}
        className="w-24 shrink-0 rounded-md border border-v/15 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-v"
      />
      <textarea
        placeholder="Commentaire"
        value={commentaire ?? ""}
        onChange={(e) => onCommentaireChange(e.target.value || null)}
        rows={2}
        className="w-full resize-none rounded-md border border-v/15 bg-white px-1.5 py-1 text-[11px] outline-none focus:border-v"
      />
    </div>
  );
}

function ScoreReadOnly({ score, commentaire }: { score: number | null; commentaire: string | null }) {
  if (score == null) return <span className="text-[12px] text-gm">—</span>;
  return (
    <div>
      <div className="font-medium text-nb">{score}%</div>
      {commentaire && <div className="mt-0.5 text-[11px] text-gm">{commentaire}</div>}
    </div>
  );
}
