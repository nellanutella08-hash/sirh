"use client";

export type StatutSuivi = "non_demarre" | "en_cours" | "en_attente" | "a_valider" | "termine" | "bloque";

export interface ObjectifLigneInput {
  id: string;
  numero: number;
  axe: string;
  objectif: string;
  livrables: string;
  kpi: string;
  cible: string;
  echeance: string;
  ponderation: number;
  statutSuivi: StatutSuivi;
}

export const STATUT_SUIVI_LABEL: Record<StatutSuivi, string> = {
  non_demarre: "Non démarré",
  en_cours: "En cours",
  en_attente: "En attente",
  a_valider: "À valider",
  termine: "Terminé",
  bloque: "Bloqué",
};

function newLigne(numero: number): ObjectifLigneInput {
  return {
    id: crypto.randomUUID(),
    numero,
    axe: "",
    objectif: "",
    livrables: "",
    kpi: "",
    cible: "",
    echeance: "",
    ponderation: 0,
    statutSuivi: "non_demarre",
  };
}

export { newLigne as newObjectifLigne };

/** Editable table of objectifs, used both when a manager creates a fiche
 * and while editing one still in brouillon. Pondération is a percentage —
 * objectifs are meant to total 80% (the remaining 20% goes to soft
 * skills), but the total is only enforced when confirming the fiche. */
export function ObjectifsEditorTable({
  objectifs,
  onChange,
}: {
  objectifs: ObjectifLigneInput[];
  onChange: (next: ObjectifLigneInput[]) => void;
}) {
  function update(id: string, patch: Partial<ObjectifLigneInput>) {
    onChange(objectifs.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  function remove(id: string) {
    onChange(objectifs.filter((o) => o.id !== id));
  }

  const total = objectifs.reduce((s, o) => s + (Number(o.ponderation) || 0), 0);

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-v/10">
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {["N°", "Axe", "Objectif", "Livrables attendus", "KPI", "Cible", "Échéance", "Pondération %", "Statut"].map((h) => (
                <th key={h} className="whitespace-nowrap px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gd">
                  {h}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {objectifs.map((o, i) => (
              <tr key={o.id} className="border-t border-v/5 align-top">
                <td className="px-2.5 py-2 text-nb">{i + 1}</td>
                <td className="px-2.5 py-2">
                  <input
                    value={o.axe}
                    onChange={(e) => update(o.id, { axe: e.target.value })}
                    className="w-28 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  />
                </td>
                <td className="px-2.5 py-2">
                  <textarea
                    value={o.objectif}
                    onChange={(e) => update(o.id, { objectif: e.target.value })}
                    rows={2}
                    className="w-44 resize-none rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  />
                </td>
                <td className="px-2.5 py-2">
                  <textarea
                    value={o.livrables}
                    onChange={(e) => update(o.id, { livrables: e.target.value })}
                    rows={2}
                    className="w-44 resize-none rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  />
                </td>
                <td className="px-2.5 py-2">
                  <input
                    value={o.kpi}
                    onChange={(e) => update(o.id, { kpi: e.target.value })}
                    className="w-32 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  />
                </td>
                <td className="px-2.5 py-2">
                  <input
                    value={o.cible}
                    onChange={(e) => update(o.id, { cible: e.target.value })}
                    className="w-20 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  />
                </td>
                <td className="px-2.5 py-2">
                  <input
                    value={o.echeance}
                    onChange={(e) => update(o.id, { echeance: e.target.value })}
                    className="w-24 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  />
                </td>
                <td className="px-2.5 py-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={o.ponderation === 0 ? "" : o.ponderation}
                    onChange={(e) => update(o.id, { ponderation: e.target.value === "" ? 0 : Number(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    className="w-16 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  />
                </td>
                <td className="px-2.5 py-2">
                  <select
                    value={o.statutSuivi}
                    onChange={(e) => update(o.id, { statutSuivi: e.target.value as StatutSuivi })}
                    className="rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  >
                    {Object.entries(STATUT_SUIVI_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2.5 py-2">
                  <button type="button" onClick={() => remove(o.id)} className="text-er">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {objectifs.length > 0 && (
            <tfoot>
              <tr className="border-t border-v/10 bg-bg font-semibold">
                <td colSpan={7} className="px-2.5 py-2 text-right text-[11px] text-gd">
                  Sous-total objectifs (cible 80%)
                </td>
                <td colSpan={2} className={`px-2.5 py-2 ${total === 80 ? "text-sc" : "text-wn"}`}>
                  {total}%
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <button
        type="button"
        onClick={() => onChange([...objectifs, newLigne(objectifs.length + 1)])}
        className="mt-2 text-xs font-medium text-v hover:underline"
      >
        + Ajouter un objectif
      </button>
    </div>
  );
}
