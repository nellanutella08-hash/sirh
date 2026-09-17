"use client";

import { useMemo, useState } from "react";
import { FicheObjectifs, type Evaluation, type TabKey } from "@/components/FicheObjectifs";
import type { CritereSoftSkill } from "@/components/SoftSkillsEditorTable";

type Viewer = "employe" | "manager";
type SortBy = "nom" | "poste" | "date";
type Groupe = "a_traiter" | "en_cours" | "terminee";

interface CampagneInfo {
  annee: string;
  entites: string[];
  statut: "ouverte" | "fermee";
}

function campagneOuvertePour(campagnes: CampagneInfo[], annee: string, departement: string): boolean {
  return campagnes.some((c) => c.statut === "ouverte" && c.annee === annee && (c.entites.length === 0 || c.entites.includes(departement)));
}

function groupeDe(e: Evaluation, viewer: Viewer, campagneOuverte: boolean): Groupe {
  if (e.statut === "terminee") return "terminee";
  if (viewer === "employe") return e.statut === "confirmee" && campagneOuverte ? "a_traiter" : "en_cours";
  return e.statut === "auto_eval" ? "a_traiter" : "en_cours";
}

const GROUP_LABEL: Record<Viewer, Record<Groupe, string>> = {
  employe: {
    a_traiter: "À faire — auto-évaluation à compléter",
    en_cours: "En cours",
    terminee: "Terminées",
  },
  manager: {
    a_traiter: "À noter — auto-évaluation reçue",
    en_cours: "En cours",
    terminee: "Terminées",
  },
};

const GROUP_TONE: Record<Groupe, string> = {
  a_traiter: "text-[#8F5500]",
  en_cours: "text-gm",
  terminee: "text-sc",
};

/** Renders a viewer's fiches as a sorted/filtered, grouped, collapsed-by-
 * default accordion list — replaces flat always-open stacks of
 * FicheObjectifs cards, which stopped being readable once a manager's
 * équipe (or année-over-année history) grew past a couple of fiches. */
export function FichesListSection({
  fiches,
  viewer,
  criteresCatalogue,
  campagnes,
  onChange,
  onDelete,
  preferredTab,
  emptyLabel,
}: {
  fiches: Evaluation[];
  viewer: Viewer;
  criteresCatalogue: CritereSoftSkill[];
  campagnes: CampagneInfo[];
  onChange: (updated: Evaluation) => void;
  onDelete?: (id: string) => void;
  preferredTab?: TabKey;
  emptyLabel: string;
}) {
  const [sortBy, setSortBy] = useState<SortBy>("nom");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filtrePoste, setFiltrePoste] = useState("");

  const showNomPoste = viewer === "manager";
  const postes = useMemo(() => Array.from(new Set(fiches.map((f) => f.poste).filter(Boolean))).sort(), [fiches]);

  const sorted = useMemo(() => {
    const list = fiches.filter((f) => !filtrePoste || f.poste === filtrePoste);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortBy === "nom") return dir * a.employeNom.localeCompare(b.employeNom);
      if (sortBy === "poste") return dir * (a.poste || "").localeCompare(b.poste || "");
      return dir * a.updatedAt.localeCompare(b.updatedAt);
    });
  }, [fiches, sortBy, sortDir, filtrePoste]);

  if (fiches.length === 0) {
    return <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-xs text-gm">{emptyLabel}</div>;
  }

  const groups = (["a_traiter", "en_cours", "terminee"] as const)
    .map((key) => ({
      key,
      items: sorted.filter((e) => groupeDe(e, viewer, campagneOuvertePour(campagnes, e.annee, e.departement)) === key),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {fiches.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-v/10 bg-white px-3 py-2">
          <span className="text-[11px] font-medium text-gm">Trier par</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1 text-xs outline-none focus:border-v"
          >
            {showNomPoste && <option value="nom">Nom (A → Z)</option>}
            {showNomPoste && <option value="poste">Poste</option>}
            <option value="date">Date de mise à jour</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="rounded-lg border border-v/15 bg-bg px-2 py-1 text-xs text-gm hover:text-nb"
            title="Inverser l'ordre"
          >
            {sortDir === "asc" ? "↑ Croissant" : "↓ Décroissant"}
          </button>
          {showNomPoste && postes.length > 1 && (
            <select
              value={filtrePoste}
              onChange={(e) => setFiltrePoste(e.target.value)}
              className="rounded-lg border border-v/15 bg-bg px-2.5 py-1 text-xs outline-none focus:border-v"
            >
              <option value="">Tous postes</option>
              {postes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key}>
          <div className="mb-2 flex items-center gap-2">
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${GROUP_TONE[g.key]}`}>
              {GROUP_LABEL[viewer][g.key]}
            </span>
            <span className="rounded-full bg-bg2 px-1.5 py-0.5 text-[10px] font-semibold text-gm">{g.items.length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {g.items.map((e) => (
              <FicheObjectifs
                key={e.id}
                evaluation={e}
                viewer={viewer}
                criteresCatalogue={criteresCatalogue}
                campagneOuverte={campagneOuvertePour(campagnes, e.annee, e.departement)}
                onChange={onChange}
                onDelete={onDelete}
                preferredTab={preferredTab}
                collapsible
                defaultOpen={false}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
