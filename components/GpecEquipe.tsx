"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Row {
  evaluationId: string | null;
  personneId: string;
  personneNom: string;
  personnePrenoms: string;
  competenceId: string;
  categorie: string;
  libelle: string;
  niveauRequis: number;
  origine: string | null;
  socleDef: [string, string, string, string] | null;
  niveauAuto: number | null; // n'apparaît ici que si les deux niveaux sont déjà complets
  niveauManager: number | null;
  niveauRetenu: number | null;
  ecart: number | null;
  alerte: boolean;
}

const NIVEAUX = [1, 2, 3, 4] as const;

function RetenuPanel({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [niveau, setNiveau] = useState<number | null>(
    row.niveauRetenu ?? (!row.alerte && row.niveauManager != null ? row.niveauManager : null)
  );
  const [commentaire, setCommentaire] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bothComplete = row.niveauAuto != null && row.niveauManager != null;
  if (!bothComplete) return null;

  async function save() {
    if (!row.evaluationId || niveau == null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/gpec/evaluations/${row.evaluationId}/retenu`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niveauRetenu: niveau, commentaire: commentaire || null }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Échec de l'enregistrement");
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[11px] font-medium text-v hover:underline"
        >
          {row.niveauRetenu ? "Modifier le niveau retenu" : "Discuter et valider le niveau retenu"}
        </button>
      ) : (
        <div className="rounded-lg border border-v/15 bg-white p-2.5">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {NIVEAUX.map((niv) => (
              <button
                key={niv}
                type="button"
                onClick={() => setNiveau(niv)}
                className={`h-6 w-6 rounded-full text-[11px] font-semibold ${
                  niveau === niv ? "bg-v text-white" : "border border-v/20 text-nb hover:bg-gl"
                }`}
              >
                {niv}
              </button>
            ))}
            <span className="ml-1 text-[11px] text-gm">Niveau retenu</span>
          </div>
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Commentaire (facultatif)"
            className="mb-1.5 w-full rounded-md border border-v/15 p-1.5 text-[11px]"
            rows={2}
          />
          {error && <div className="mb-1.5 text-[11px] text-er">{error}</div>}
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={niveau == null || saving}
              onClick={save}
              className="rounded-md bg-v px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Valider"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-[11px] text-gm">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Module 4 — évaluation manager. niveau_auto n'apparaît dans les données
 * reçues que lorsque niveau_manager est déjà saisi (biais d'ancrage — voir
 * projectGpecEvaluation), donc rien de spécial à cacher ici. */
export function GpecEquipe({
  campagne,
  personnes,
  rows,
}: {
  campagne: { id: string; nom: string; statut: "ouverte" | "cloturee" } | null;
  personnes: { id: string; nom: string; prenoms: string }[];
  rows: Row[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveNiveauManager(evaluationId: string, niveau: number) {
    setSaving(evaluationId);
    setError(null);
    try {
      const res = await fetch(`/api/gpec/evaluations/${evaluationId}/manager`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niveauManager: niveau }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Échec de l'enregistrement");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSaving(null);
    }
  }

  const rowsByPersonne = new Map<string, Row[]>();
  for (const r of rows) {
    if (!rowsByPersonne.has(r.personneId)) rowsByPersonne.set(r.personneId, []);
    rowsByPersonne.get(r.personneId)!.push(r);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[14px] border border-v/10 bg-white p-4 text-xs text-gm">
        {campagne ? (
          <>
            Campagne : <span className="font-medium text-nb">{campagne.nom}</span> —{" "}
            {campagne.statut === "ouverte" ? <span className="text-sc">ouverte</span> : <span>clôturée</span>}
          </>
        ) : (
          "Aucune campagne GPEC pour le moment."
        )}
      </div>

      {error && <div className="text-xs text-er">{error}</div>}

      {personnes.length === 0 && (
        <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-xs text-gm">
          Personne ne vous est actuellement rattaché dans GPEC.
        </div>
      )}

      {personnes.map((p) => {
        const personRows = rowsByPersonne.get(p.id) ?? [];
        return (
          <div key={p.id} className="rounded-[14px] border border-v/10 bg-white p-4">
            <div className="mb-3 text-sm font-semibold text-nb">
              {p.prenoms} {p.nom}
            </div>
            {personRows.length === 0 ? (
              <div className="text-xs text-gm">Aucune compétence rattachée pour cette campagne.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {personRows.map((r) => (
                  <div key={r.competenceId} className="rounded-lg bg-bg p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium text-nb">{r.libelle}</div>
                        <div className="mt-0.5 text-[11px] text-gm">
                          {r.categorie} — Niveau requis : {r.niveauRequis}
                        </div>
                        {r.origine && r.origine !== "Référentiel initial" && (
                          <div className="mt-0.5 text-[10px] text-mg">{r.origine}</div>
                        )}
                      </div>
                      {r.ecart != null && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            r.alerte ? "bg-er/15 text-er" : "bg-sc/15 text-[#0E7A50]"
                          }`}
                        >
                          {r.alerte ? "Alerte — " : ""}Écart {r.ecart > 0 ? `+${r.ecart}` : r.ecart}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {NIVEAUX.map((niv) => {
                        const label = r.socleDef ? r.socleDef[niv - 1] : null;
                        const active = r.niveauManager === niv;
                        return (
                          <button
                            key={niv}
                            type="button"
                            title={label ?? undefined}
                            disabled={campagne?.statut !== "ouverte" || saving === r.evaluationId}
                            onClick={() => r.evaluationId && saveNiveauManager(r.evaluationId, niv)}
                            className={`h-7 w-7 rounded-full text-xs font-semibold transition-colors ${
                              active ? "bg-v text-white" : "border border-v/20 text-nb hover:bg-gl"
                            } disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            {niv}
                          </button>
                        );
                      })}
                      <span className="ml-1 text-[11px] text-gm">
                        {r.niveauManager
                          ? `Votre évaluation : ${r.niveauManager}`
                          : "Non évalué — auto-évaluation non visible tant que vous n'avez pas saisi la vôtre"}
                      </span>
                    </div>

                    <RetenuPanel row={r} onSaved={() => router.refresh()} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
