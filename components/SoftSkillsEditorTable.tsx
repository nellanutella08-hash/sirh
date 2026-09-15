"use client";

export type NiveauAttendu = "initie" | "autonome" | "avance" | "expert";

export interface SoftSkillLigneInput {
  id: string;
  critereId: string | null;
  libelle: string;
  description: string;
  niveauAttendu: NiveauAttendu;
  ponderation: number;
}

export interface CritereSoftSkill {
  id: string;
  libelle: string;
  description: string;
  profil: string;
}

export const NIVEAU_ATTENDU_LABEL: Record<NiveauAttendu, string> = {
  initie: "Initié(e)",
  autonome: "Autonome",
  avance: "Avancé",
  expert: "Expert(e)",
};

function newLigne(): SoftSkillLigneInput {
  return { id: crypto.randomUUID(), critereId: null, libelle: "", description: "", niveauAttendu: "autonome", ponderation: 0 };
}

/** Editable table of soft skills — each ligne can be picked from the
 * référentiel catalogue (prefills libellé/description, still editable) or
 * added freehand. Meant to total 20%. */
export function SoftSkillsEditorTable({
  softSkills,
  onChange,
  catalogue,
}: {
  softSkills: SoftSkillLigneInput[];
  onChange: (next: SoftSkillLigneInput[]) => void;
  catalogue: CritereSoftSkill[];
}) {
  function update(id: string, patch: Partial<SoftSkillLigneInput>) {
    onChange(softSkills.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function remove(id: string) {
    onChange(softSkills.filter((s) => s.id !== id));
  }
  function addFromCatalogue(critereId: string) {
    const c = catalogue.find((x) => x.id === critereId);
    if (!c) return;
    onChange([
      ...softSkills,
      { id: crypto.randomUUID(), critereId: c.id, libelle: c.libelle, description: c.description, niveauAttendu: "autonome", ponderation: 0 },
    ]);
  }

  const total = softSkills.reduce((s, x) => s + (Number(x.ponderation) || 0), 0);

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-v/10">
        <table className="w-full min-w-[760px] border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {["Critère", "Comportements attendus", "Niveau attendu", "Pondération %"].map((h) => (
                <th key={h} className="whitespace-nowrap px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gd">
                  {h}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {softSkills.map((s) => (
              <tr key={s.id} className="border-t border-v/5 align-top">
                <td className="px-2.5 py-2">
                  <input
                    value={s.libelle}
                    onChange={(e) => update(s.id, { libelle: e.target.value })}
                    className="w-40 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  />
                </td>
                <td className="px-2.5 py-2">
                  <textarea
                    value={s.description}
                    onChange={(e) => update(s.id, { description: e.target.value })}
                    rows={2}
                    className="w-64 resize-none rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  />
                </td>
                <td className="px-2.5 py-2">
                  <select
                    value={s.niveauAttendu}
                    onChange={(e) => update(s.id, { niveauAttendu: e.target.value as NiveauAttendu })}
                    className="rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  >
                    {Object.entries(NIVEAU_ATTENDU_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2.5 py-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={s.ponderation === 0 ? "" : s.ponderation}
                    onChange={(e) => update(s.id, { ponderation: e.target.value === "" ? 0 : Number(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    className="w-16 rounded-md border border-v/15 bg-bg px-1.5 py-1 text-[11px] outline-none focus:border-v"
                  />
                </td>
                <td className="px-2.5 py-2">
                  <button type="button" onClick={() => remove(s.id)} className="text-er">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {softSkills.length > 0 && (
            <tfoot>
              <tr className="border-t border-v/10 bg-bg font-semibold">
                <td colSpan={3} className="px-2.5 py-2 text-right text-[11px] text-gd">
                  Sous-total soft skills (cible 20%)
                </td>
                <td colSpan={2} className={`px-2.5 py-2 ${total === 20 ? "text-sc" : "text-wn"}`}>
                  {total}%
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {catalogue.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && addFromCatalogue(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2 py-1.5 text-[11px] outline-none focus:border-v"
          >
            <option value="">+ Depuis le référentiel…</option>
            {catalogue.map((c) => (
              <option key={c.id} value={c.id}>
                {c.libelle} {c.profil !== "tous" ? `(${c.profil})` : ""}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => onChange([...softSkills, newLigne()])}
          className="text-xs font-medium text-v hover:underline"
        >
          + Ajouter un critère libre
        </button>
      </div>
    </div>
  );
}
