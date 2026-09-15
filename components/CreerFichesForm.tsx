"use client";

import { useState } from "react";
import { ObjectifsEditorTable, type ObjectifLigneInput } from "@/components/ObjectifsEditorTable";
import { SoftSkillsEditorTable, type SoftSkillLigneInput, type CritereSoftSkill } from "@/components/SoftSkillsEditorTable";
import type { Evaluation } from "@/components/FicheObjectifs";

interface EmployeOption {
  id: number;
  fullname: string;
  fonction: string;
}

/** Creation form for one or several fiches at once, sharing the same
 * objectifs/soft-skills template — this is how a "fiche transverse" (the
 * same objectifs shared by several collaboratrices, à la Ericka/Ketoura)
 * gets built: fill the template once, tick every collaborateur it applies
 * to, and each gets their own independent fiche from it. */
export function CreerFichesForm({
  employeOptions,
  criteresCatalogue,
  onCreated,
}: {
  employeOptions: EmployeOption[];
  criteresCatalogue: CritereSoftSkill[];
  onCreated: (evaluations: Evaluation[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [annee, setAnnee] = useState(String(new Date().getFullYear()));
  const [objectifs, setObjectifs] = useState<ObjectifLigneInput[]>([]);
  const [softSkills, setSoftSkills] = useState<SoftSkillLigneInput[]>([]);
  const [estTest, setEstTest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (selectedIds.length === 0 || !annee.trim()) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeIds: selectedIds, annee: annee.trim(), objectifs, softSkills, estTest }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Échec de la création");
      return;
    }
    onCreated(data as Evaluation[]);
    setSelectedIds([]);
    setObjectifs([]);
    setSoftSkills([]);
  }

  return (
    <form onSubmit={submit} className="rounded-[14px] border border-v/10 bg-white p-4">
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gd">
            Collaborateur(s) — {selectedIds.length} sélectionné(s)
          </label>
          <div className="max-h-36 overflow-y-auto rounded-lg border border-v/15 bg-bg p-2">
            {employeOptions.map((e) => (
              <label key={e.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-white">
                <input type="checkbox" checked={selectedIds.includes(e.id)} onChange={() => toggle(e.id)} />
                {e.fullname} — <span className="text-gm">{e.fonction}</span>
              </label>
            ))}
            {employeOptions.length === 0 && <div className="p-1 text-xs text-gm">Aucun collaborateur disponible.</div>}
          </div>
          <p className="mt-1 text-[10px] text-gm">
            Plusieurs collaborateurs cochés = même fiche modèle appliquée à chacun (objectifs transverses),
            chacun avec sa propre notation ensuite.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gd">Année</label>
          <input
            required
            value={annee}
            onChange={(e) => setAnnee(e.target.value)}
            className="w-24 rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
          />
          <label className="mt-2 flex items-center gap-1.5 text-[11px] text-gd">
            <input type="checkbox" checked={estTest} onChange={(e) => setEstTest(e.target.checked)} />
            Fiche test
          </label>
        </div>
      </div>

      <div className="mb-1 text-xs font-semibold text-gd">Objectifs (80%)</div>
      <ObjectifsEditorTable objectifs={objectifs} onChange={setObjectifs} />
      <div className="mb-1 mt-4 text-xs font-semibold text-gd">Soft skills (20%)</div>
      <SoftSkillsEditorTable softSkills={softSkills} onChange={setSoftSkills} catalogue={criteresCatalogue} />

      {error && <div className="mt-3 text-xs text-er">{error}</div>}

      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={saving || selectedIds.length === 0}
          className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
        >
          {saving ? "Création…" : `Créer ${selectedIds.length > 1 ? `${selectedIds.length} fiches` : "la fiche"}`}
        </button>
      </div>
    </form>
  );
}
