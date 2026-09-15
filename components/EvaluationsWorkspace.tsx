"use client";

import { useState } from "react";
import { FicheObjectifs, type Evaluation } from "@/components/FicheObjectifs";
import { CreerFichesForm } from "@/components/CreerFichesForm";
import type { CritereSoftSkill } from "@/components/SoftSkillsEditorTable";

interface EquipeMember {
  id: number;
  fullname: string;
  fonction: string;
}

interface CampagneInfo {
  annee: string;
  entites: string[];
  statut: "ouverte" | "fermee";
}

function campagneOuvertePour(campagnes: CampagneInfo[], annee: string, departement: string): boolean {
  return campagnes.some((c) => c.statut === "ouverte" && c.annee === annee && (c.entites.length === 0 || c.entites.includes(departement)));
}

export function EvaluationsWorkspace({
  mesFiches: mesFichesInitial,
  equipeFiches: equipeFichesInitial,
  equipe,
  criteresCatalogue,
  campagnes,
}: {
  mesFiches: Evaluation[];
  equipeFiches: Evaluation[];
  equipe: EquipeMember[];
  criteresCatalogue: CritereSoftSkill[];
  campagnes: CampagneInfo[];
}) {
  const [mesFiches, setMesFiches] = useState(mesFichesInitial);
  const [equipeFiches, setEquipeFiches] = useState(equipeFichesInitial);

  function updateMienne(updated: Evaluation) {
    setMesFiches((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function updateEquipe(updated: Evaluation) {
    setEquipeFiches((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function removeEquipe(id: string) {
    setEquipeFiches((prev) => prev.filter((e) => e.id !== id));
  }

  function onCreated(created: Evaluation[]) {
    setEquipeFiches((prev) => [...created, ...prev]);
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
              <FicheObjectifs
                key={e.id}
                evaluation={e}
                viewer="employe"
                criteresCatalogue={criteresCatalogue}
                campagneOuverte={campagneOuvertePour(campagnes, e.annee, e.departement)}
                onChange={updateMienne}
              />
            ))}
          </div>
        )}
      </div>

      {equipe.length > 0 && (
        <div>
          <div className="mb-3 text-[13px] font-semibold text-nb">Objectifs de mon équipe</div>

          <div className="mb-4">
            <CreerFichesForm employeOptions={equipe} criteresCatalogue={criteresCatalogue} onCreated={onCreated} />
          </div>

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
                  criteresCatalogue={criteresCatalogue}
                  campagneOuverte={campagneOuvertePour(campagnes, e.annee, e.departement)}
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
