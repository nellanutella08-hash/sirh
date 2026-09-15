"use client";

import { useMemo, useState } from "react";
import { FicheObjectifs, type Evaluation, type EvaluationStatut } from "@/components/FicheObjectifs";
import { FichesListSection } from "@/components/FichesListSection";
import { CreerFichesForm } from "@/components/CreerFichesForm";
import { CampagnesAdmin, type Campagne } from "@/components/CampagnesAdmin";
import { ReferentielSoftSkillsAdmin } from "@/components/ReferentielSoftSkillsAdmin";
import { TestSessionGenerator } from "@/components/TestSessionGenerator";
import type { CritereSoftSkill } from "@/components/SoftSkillsEditorTable";

interface EmployeOption {
  id: number;
  fullname: string;
  entite: string;
  fonction: string;
  estManager: boolean;
}

interface EquipeMember {
  id: number;
  fullname: string;
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

type TopTab = "objectifs" | "campagnes" | "referentiel" | "comptes-test";
type SousVue = "employe" | "manager" | "rh";

/** Le point d'entrée unique du module Évaluations. Avant, "Mes objectifs"
 * (vue employé/manager) et "Évaluations" (admin RH) étaient deux pages
 * séparées qui ne se parlaient pas, et à l'intérieur tout s'empilait à plat
 * (ses propres objectifs, ceux de l'équipe, les fiches test…) sans
 * distinction — illisible dès qu'il y a plus de deux fiches. Ici, un seul
 * point d'entrée avec deux onglets de contenu (Objectifs / Campagnes), et
 * pour qui cumule plusieurs rôles (collaborateur + manager + RH), chaque
 * rôle a sa propre sous-vue au lieu d'un mélange. */
export function EvaluationsHub({
  isRH,
  isManager,
  mesFiches: mesFichesInitial,
  equipeFiches: equipeFichesInitial,
  equipe,
  allFiches: allFichesInitial,
  employesRH,
  initialCriteres,
  initialCampagnes,
  entitesDisponibles,
  initialVue,
}: {
  isRH: boolean;
  isManager: boolean;
  mesFiches: Evaluation[];
  equipeFiches: Evaluation[];
  equipe: EquipeMember[];
  allFiches: Evaluation[];
  employesRH: EmployeOption[];
  initialCriteres: CritereSoftSkill[];
  initialCampagnes: Campagne[];
  entitesDisponibles: string[];
  /** Le lien "Mes objectifs" du menu passe "employe"/"manager" (via
   * ?vue=perso côté page) pour atterrir sur l'espace personnel même pour
   * quelqu'un de la RH — sans quoi la vue RH est prioritaire par défaut. */
  initialVue?: SousVue;
}) {
  const [topTab, setTopTab] = useState<TopTab>("objectifs");
  const defaultVue: SousVue = initialVue ?? (isRH ? "rh" : isManager ? "manager" : "employe");
  const [objectifsVue, setObjectifsVue] = useState<SousVue>(defaultVue);
  const [campagnesVue, setCampagnesVue] = useState<SousVue>(defaultVue);

  const [mesFiches, setMesFiches] = useState(mesFichesInitial);
  const [equipeFiches, setEquipeFiches] = useState(equipeFichesInitial);
  const [allFiches, setAllFiches] = useState(allFichesInitial);
  const [criteres, setCriteres] = useState(initialCriteres);
  const [campagnes, setCampagnes] = useState(initialCampagnes);

  function updateMienne(updated: Evaluation) {
    setMesFiches((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }
  function updateEquipe(updated: Evaluation) {
    setEquipeFiches((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }
  function removeEquipe(id: string) {
    setEquipeFiches((prev) => prev.filter((e) => e.id !== id));
  }
  function onEquipeCreated(created: Evaluation[]) {
    setEquipeFiches((prev) => [...created, ...prev]);
  }

  const [rhOpenId, setRhOpenId] = useState<string | null>(null);
  const [rhShowCreate, setRhShowCreate] = useState(false);
  const [rhFiltreAnnee, setRhFiltreAnnee] = useState("");
  const [rhFiltreDepartement, setRhFiltreDepartement] = useState("");
  const [rhFiltreStatut, setRhFiltreStatut] = useState<EvaluationStatut | "">("");

  const rhAnnees = useMemo(() => Array.from(new Set(allFiches.map((e) => e.annee))).sort().reverse(), [allFiches]);
  const rhDepartements = useMemo(
    () => Array.from(new Set(allFiches.map((e) => e.departement).filter(Boolean))).sort(),
    [allFiches]
  );
  const rhFiltered = allFiches.filter(
    (e) =>
      (!rhFiltreAnnee || e.annee === rhFiltreAnnee) &&
      (!rhFiltreDepartement || e.departement === rhFiltreDepartement) &&
      (!rhFiltreStatut || e.statut === rhFiltreStatut)
  );

  function updateRh(updated: Evaluation) {
    setAllFiches((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }
  function removeRh(id: string) {
    setAllFiches((prev) => prev.filter((e) => e.id !== id));
    setRhOpenId(null);
  }
  function onRhCreated(created: Evaluation[]) {
    setAllFiches((prev) => [...created, ...prev]);
    setRhShowCreate(false);
    if (created.length === 1) setRhOpenId(created[0].id);
  }

  const topTabs: { key: TopTab; label: string }[] = [{ key: "objectifs", label: "Objectifs" }];
  if (isRH) topTabs.push({ key: "referentiel", label: "Référentiel soft skills" });
  topTabs.push({ key: "campagnes", label: "Campagnes" });
  if (isRH) topTabs.push({ key: "comptes-test", label: "Comptes test" });

  const sousVues: { key: SousVue; label: string }[] = [
    { key: "employe", label: "Ma vue employé" },
    ...(isManager ? ([{ key: "manager", label: "Vue manager" }] as const) : []),
    ...(isRH ? ([{ key: "rh", label: "Vue RH" }] as const) : []),
  ];

  function sousVuePills(active: SousVue, onChange: (v: SousVue) => void) {
    if (sousVues.length <= 1) return null;
    return (
      <div className="mb-4 flex flex-wrap gap-1.5">
        {sousVues.map((v) => (
          <button
            key={v.key}
            onClick={() => onChange(v.key)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
              active === v.key ? "bg-v text-white" : "bg-bg2 text-gm hover:text-nb"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex gap-0.5 rounded-[10px] bg-bg2 p-1">
        {topTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTopTab(t.key)}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              topTab === t.key ? "bg-white text-v shadow-sm" : "text-gm hover:text-nb"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {topTab === "referentiel" && <ReferentielSoftSkillsAdmin initialCriteres={criteres} onChange={setCriteres} />}
      {topTab === "comptes-test" && <TestSessionGenerator employes={employesRH} />}

      {topTab === "objectifs" && (
        <>
          {sousVuePills(objectifsVue, setObjectifsVue)}

          {objectifsVue === "employe" && (
            <FichesListSection
              fiches={mesFiches}
              viewer="employe"
              criteresCatalogue={criteres}
              campagnes={campagnes}
              onChange={updateMienne}
              preferredTab="fiche"
              emptyLabel="Aucune fiche d'objectifs ne vous a encore été assignée."
            />
          )}

          {objectifsVue === "manager" && isManager && (
            <div className="flex flex-col gap-4">
              <CreerFichesForm employeOptions={equipe} criteresCatalogue={criteres} onCreated={onEquipeCreated} />
              <FichesListSection
                fiches={equipeFiches}
                viewer="manager"
                criteresCatalogue={criteres}
                campagnes={campagnes}
                onChange={updateEquipe}
                onDelete={removeEquipe}
                preferredTab="fiche"
                emptyLabel="Aucune fiche créée pour votre équipe pour le moment."
              />
            </div>
          )}

          {objectifsVue === "rh" && isRH && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <select
                    value={rhFiltreAnnee}
                    onChange={(e) => setRhFiltreAnnee(e.target.value)}
                    className="rounded-lg border border-v/15 bg-white px-3 py-1.5 text-xs outline-none focus:border-v"
                  >
                    <option value="">Toutes années</option>
                    {rhAnnees.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rhFiltreDepartement}
                    onChange={(e) => setRhFiltreDepartement(e.target.value)}
                    className="rounded-lg border border-v/15 bg-white px-3 py-1.5 text-xs outline-none focus:border-v"
                  >
                    <option value="">Tous départements</option>
                    {rhDepartements.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rhFiltreStatut}
                    onChange={(e) => setRhFiltreStatut(e.target.value as EvaluationStatut | "")}
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
                  onClick={() => setRhShowCreate((v) => !v)}
                  className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm"
                >
                  + Nouvelle(s) fiche(s)
                </button>
              </div>

              {rhShowCreate && (
                <div className="mb-4">
                  <CreerFichesForm
                    employeOptions={employesRH.map((e) => ({ id: e.id, fullname: e.fullname, fonction: e.fonction }))}
                    criteresCatalogue={criteres}
                    onCreated={onRhCreated}
                  />
                </div>
              )}

              <div className="overflow-hidden rounded-[14px] border border-v/10 bg-white">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-bg">
                      {["Collaborateur", "Poste", "Département", "Responsable", "Année", "Statut", "Score"].map((h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rhFiltered.map((e) => (
                      <tr
                        key={e.id}
                        onClick={() => setRhOpenId(rhOpenId === e.id ? null : e.id)}
                        className="cursor-pointer border-b border-v/5 last:border-none hover:bg-gl"
                      >
                        <td className="px-3.5 py-2.5 font-medium text-nb">
                          {e.employeNom}
                          {e.estTest && (
                            <span className="ml-1.5 rounded-full bg-wn/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#7A4A00]">
                              TEST
                            </span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-nb">{e.poste || "—"}</td>
                        <td className="px-3.5 py-2.5 text-nb">{e.departement || "—"}</td>
                        <td className="px-3.5 py-2.5 text-nb">{e.responsableNom}</td>
                        <td className="px-3.5 py-2.5 text-nb">{e.annee}</td>
                        <td className="px-3.5 py-2.5 text-nb">{STATUT_LABEL[e.statut]}</td>
                        <td className="px-3.5 py-2.5 font-mono text-nb">{e.scoreGlobal != null ? `${e.scoreGlobal}%` : "—"}</td>
                      </tr>
                    ))}
                    {rhFiltered.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3.5 py-8 text-center text-gm">
                          Aucune fiche pour ces filtres.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {rhOpenId &&
                (() => {
                  const e = allFiches.find((x) => x.id === rhOpenId);
                  if (!e) return null;
                  return (
                    <div className="mt-4">
                      <FicheObjectifs
                        evaluation={e}
                        viewer="rh"
                        criteresCatalogue={criteres}
                        campagneOuverte={campagneOuvertePour(campagnes, e.annee, e.departement)}
                        onChange={updateRh}
                        onDelete={removeRh}
                      />
                    </div>
                  );
                })()}
            </>
          )}
        </>
      )}

      {topTab === "campagnes" && (
        <>
          {sousVuePills(campagnesVue, setCampagnesVue)}

          {campagnesVue === "employe" && (
            <FichesListSection
              fiches={mesFiches.filter((f) => f.statut !== "brouillon")}
              viewer="employe"
              criteresCatalogue={criteres}
              campagnes={campagnes}
              onChange={updateMienne}
              preferredTab="auto_eval"
              emptyLabel="Aucune fiche confirmée pour le moment — l'auto-évaluation sera possible une fois vos objectifs transmis par votre manager."
            />
          )}

          {campagnesVue === "manager" && isManager && (
            <FichesListSection
              fiches={equipeFiches.filter((f) => f.statut !== "brouillon")}
              viewer="manager"
              criteresCatalogue={criteres}
              campagnes={campagnes}
              onChange={updateEquipe}
              preferredTab="notation"
              emptyLabel="Aucune auto-évaluation reçue de votre équipe pour le moment."
            />
          )}

          {campagnesVue === "rh" && isRH && (
            <CampagnesAdmin initialCampagnes={campagnes} entitesDisponibles={entitesDisponibles} onChange={setCampagnes} />
          )}
        </>
      )}
    </div>
  );
}
