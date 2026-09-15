"use client";

import { useMemo, useState } from "react";
import { FicheObjectifs, type Evaluation, type EvaluationStatut } from "@/components/FicheObjectifs";
import { CreerFichesForm } from "@/components/CreerFichesForm";
import { CampagnesAdmin, type Campagne } from "@/components/CampagnesAdmin";
import { ReferentielSoftSkillsAdmin } from "@/components/ReferentielSoftSkillsAdmin";
import type { CritereSoftSkill } from "@/components/SoftSkillsEditorTable";

interface EmployeOption {
  id: number;
  fullname: string;
  entite: string;
  fonction: string;
}

const STATUT_LABEL: Record<EvaluationStatut, string> = {
  brouillon: "Brouillon",
  confirmee: "Objectifs confirmés",
  auto_eval: "Auto-évaluation reçue",
  terminee: "Terminée",
};

function campagneOuvertePour(campagnes: Campagne[], annee: string, departement: string): boolean {
  return campagnes.some((c) => c.statut === "ouverte" && c.annee === annee && (c.entites.length === 0 || c.entites.includes(departement)));
}

/** RH's oversight view — the "Consolidé" equivalent from le modèle Excel :
 * une ligne par fiche, filtrable, avec détail au clic, plus la gestion du
 * référentiel de soft skills et des campagnes d'évaluation. */
export function EvaluationsConsolide({
  initialEvaluations,
  employes,
  initialCriteres,
  initialCampagnes,
  entitesDisponibles,
}: {
  initialEvaluations: Evaluation[];
  employes: EmployeOption[];
  initialCriteres: CritereSoftSkill[];
  initialCampagnes: Campagne[];
  entitesDisponibles: string[];
}) {
  const [tab, setTab] = useState<"fiches" | "referentiel" | "campagnes">("fiches");
  const [evaluations, setEvaluations] = useState(initialEvaluations);
  const [campagnes, setCampagnes] = useState(initialCampagnes);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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

  function onCreated(created: Evaluation[]) {
    setEvaluations((prev) => [...created, ...prev]);
    setShowCreate(false);
    if (created.length === 1) setOpenId(created[0].id);
  }

  // Fetched once via listCriteresSoftSkills server-side, so this stays in
  // sync with the référentiel tab's own state via a shared parent — simplest
  // is just re-deriving it fresh from initialCriteres plus whatever the
  // référentiel tab has added, tracked locally.
  const [criteres, setCriteres] = useState(initialCriteres);

  return (
    <div>
      <div className="mb-4 flex gap-0.5 rounded-[10px] bg-bg2 p-1">
        {[
          { key: "fiches" as const, label: "Fiches" },
          { key: "referentiel" as const, label: "Référentiel soft skills" },
          { key: "campagnes" as const, label: "Campagnes" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              tab === t.key ? "bg-white text-v shadow-sm" : "text-gm hover:text-nb"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "referentiel" && <ReferentielSoftSkillsAdmin initialCriteres={criteres} onChange={setCriteres} />}
      {tab === "campagnes" && (
        <CampagnesAdmin initialCampagnes={campagnes} entitesDisponibles={entitesDisponibles} onChange={setCampagnes} />
      )}

      {tab === "fiches" && (
        <>
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
              + Nouvelle(s) fiche(s)
            </button>
          </div>

          {showCreate && (
            <div className="mb-4">
              <CreerFichesForm
                employeOptions={employes.map((e) => ({ id: e.id, fullname: e.fullname, fonction: e.fonction }))}
                criteresCatalogue={criteres}
                onCreated={onCreated}
              />
            </div>
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
                    <td className="px-3.5 py-2.5 font-mono text-nb">{e.scoreGlobal != null ? `${e.scoreGlobal}%` : "—"}</td>
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

          {openId &&
            (() => {
              const e = evaluations.find((x) => x.id === openId);
              if (!e) return null;
              return (
                <div className="mt-4">
                  <FicheObjectifs
                    evaluation={e}
                    viewer="rh"
                    criteresCatalogue={criteres}
                    campagneOuverte={campagneOuvertePour(campagnes, e.annee, e.departement)}
                    onChange={update}
                    onDelete={remove}
                  />
                </div>
              );
            })()}
        </>
      )}
    </div>
  );
}
