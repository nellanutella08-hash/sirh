"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Row {
  evaluationId: string | null;
  competenceId: string;
  categorie: string;
  libelle: string;
  niveauRequis: number;
  origine: string | null;
  socleDef: [string, string, string, string] | null;
  niveauAuto: number | null;
  niveauManager: number | null;
  niveauRetenu: number | null;
  ecart: number | null;
  alerte: boolean;
}

const NIVEAUX = [1, 2, 3, 4] as const;

/** Module 3 — auto-évaluation. Le collaborateur ne voit son niveau_manager/
 * niveau_retenu que si la campagne est clôturée (déjà filtré côté serveur —
 * voir projectGpecEvaluation) ; niveau_auto reste modifiable tant que la
 * campagne est ouverte. */
export function GpecMesCompetences({
  personne,
  campagne,
  rows,
}: {
  personne: { nom: string; prenoms: string; fonctionContrat: string };
  campagne: { id: string; nom: string; statut: "ouverte" | "cloturee" } | null;
  rows: Row[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveNiveauAuto(evaluationId: string, niveau: number) {
    setSaving(evaluationId);
    setError(null);
    try {
      const res = await fetch(`/api/gpec/evaluations/${evaluationId}/auto`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niveauAuto: niveau }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Échec de l'enregistrement");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSaving(null);
    }
  }

  const cloturee = campagne?.statut === "cloturee";
  const parCategorie = new Map<string, Row[]>();
  for (const r of rows) {
    if (!parCategorie.has(r.categorie)) parCategorie.set(r.categorie, []);
    parCategorie.get(r.categorie)!.push(r);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[14px] border border-v/10 bg-white p-4">
        <div className="text-sm font-semibold text-nb">
          {personne.prenoms} {personne.nom}
        </div>
        <div className="mt-0.5 text-xs text-gm">{personne.fonctionContrat}</div>
        {campagne ? (
          <div className="mt-2 text-xs text-gm">
            Campagne : <span className="font-medium text-nb">{campagne.nom}</span> —{" "}
            {campagne.statut === "ouverte" ? (
              <span className="text-sc">ouverte, votre auto-évaluation est modifiable</span>
            ) : (
              <span>clôturée</span>
            )}
          </div>
        ) : (
          <div className="mt-2 text-xs text-gm">Aucune campagne GPEC pour le moment.</div>
        )}
      </div>

      {error && <div className="text-xs text-er">{error}</div>}

      {rows.length === 0 && (
        <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-xs text-gm">
          Aucune compétence rattachée à votre emploi-type pour le moment.
        </div>
      )}

      {Array.from(parCategorie.entries()).map(([categorie, catRows]) => (
        <div key={categorie} className="rounded-[14px] border border-v/10 bg-white p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gm">{categorie}</div>
          <div className="flex flex-col gap-3">
            {catRows.map((r) => (
              <div key={r.competenceId} className="rounded-lg bg-bg p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-nb">{r.libelle}</div>
                    <div className="mt-0.5 text-[11px] text-gm">Niveau requis : {r.niveauRequis}</div>
                    {r.origine && r.origine !== "Référentiel initial" && (
                      <div className="mt-0.5 text-[10px] text-mg">{r.origine}</div>
                    )}
                  </div>
                  {cloturee && r.ecart != null && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        r.alerte ? "bg-er/15 text-er" : "bg-sc/15 text-[#0E7A50]"
                      }`}
                    >
                      Écart {r.ecart > 0 ? `+${r.ecart}` : r.ecart}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {NIVEAUX.map((niv) => {
                    const label = r.socleDef ? r.socleDef[niv - 1] : null;
                    const active = r.niveauAuto === niv;
                    return (
                      <button
                        key={niv}
                        type="button"
                        title={label ?? undefined}
                        disabled={campagne?.statut !== "ouverte" || saving === r.evaluationId}
                        onClick={() => r.evaluationId && saveNiveauAuto(r.evaluationId, niv)}
                        className={`h-7 w-7 rounded-full text-xs font-semibold transition-colors ${
                          active ? "bg-v text-white" : "border border-v/20 text-nb hover:bg-gl"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {niv}
                      </button>
                    );
                  })}
                  <span className="ml-1 text-[11px] text-gm">
                    {r.niveauAuto ? `Votre auto-évaluation : ${r.niveauAuto}` : "Non évalué"}
                  </span>
                </div>

                {cloturee && (
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gm">
                    <span>Niveau manager : {r.niveauManager ?? "—"}</span>
                    <span>Niveau retenu : {r.niveauRetenu ?? "—"}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
