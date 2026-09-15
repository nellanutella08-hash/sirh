"use client";

import { useState } from "react";
import type { CritereSoftSkill } from "@/components/SoftSkillsEditorTable";

/** RH-only CRUD on the shared soft-skills catalogue managers pick from when
 * building a fiche. `profil` is a free-text tag ("tous", "technique", …)
 * used only as a hint in the picker. */
export function ReferentielSoftSkillsAdmin({
  initialCriteres,
  onChange,
}: {
  initialCriteres: CritereSoftSkill[];
  onChange?: (criteres: CritereSoftSkill[]) => void;
}) {
  const [criteres, setCriteresState] = useState(initialCriteres);
  function setCriteres(next: CritereSoftSkill[] | ((prev: CritereSoftSkill[]) => CritereSoftSkill[])) {
    setCriteresState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: CritereSoftSkill[]) => CritereSoftSkill[])(prev) : next;
      onChange?.(resolved);
      return resolved;
    });
  }
  const [showForm, setShowForm] = useState(false);
  const [libelle, setLibelle] = useState("");
  const [description, setDescription] = useState("");
  const [profil, setProfil] = useState("tous");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function creer(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/evaluations/criteres", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ libelle, description, profil }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) return setError(data.error ?? "Échec");
    setCriteres((prev) => [...prev, data as CritereSoftSkill]);
    setLibelle("");
    setDescription("");
    setProfil("tous");
    setShowForm(false);
  }

  async function remove(c: CritereSoftSkill) {
    if (!confirm(`Supprimer le critère « ${c.libelle} » du référentiel ?`)) return;
    const res = await fetch(`/api/evaluations/criteres/${c.id}`, { method: "DELETE" });
    if (res.ok) setCriteres((prev) => prev.filter((x) => x.id !== c.id));
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setShowForm((v) => !v)} className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm">
          + Nouveau critère
        </button>
      </div>

      {showForm && (
        <form onSubmit={creer} className="mb-4 flex flex-col gap-2 rounded-[14px] border border-v/10 bg-white p-4">
          <input
            required
            placeholder="Libellé (ex: Reporting des activités)"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
          />
          <textarea
            placeholder="Comportements attendus"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="resize-none rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
          />
          <input
            placeholder="Profil (tous, technique, …)"
            value={profil}
            onChange={(e) => setProfil(e.target.value)}
            className="w-40 rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
          />
          {error && <div className="text-xs text-er">{error}</div>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
            >
              Ajouter
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-[14px] border border-v/10 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {["Libellé", "Comportements attendus", "Profil", ""].map((h) => (
                <th key={h} className="px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteres.map((c) => (
              <tr key={c.id} className="border-b border-v/5 last:border-none">
                <td className="px-3.5 py-2.5 font-medium text-nb">{c.libelle}</td>
                <td className="px-3.5 py-2.5 text-gm">{c.description}</td>
                <td className="px-3.5 py-2.5 text-nb">{c.profil}</td>
                <td className="px-3.5 py-2.5">
                  <button onClick={() => remove(c)} className="text-[11px] text-er hover:underline">
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
