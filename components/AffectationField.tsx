"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface Affectation {
  categorie: string | null;
  regie: string | null;
  poleTechSupport: string | null;
  classification: "regie" | "hors_regie" | null;
  typeProjet: string | null;
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  regie: "Régie",
  hors_regie: "Hors régie",
};

/** Staffing info (catégorie, régie, pôle technique/support, classification,
 * type de projet) — comes from RH's "fichier consolidé du personnel", not
 * Neos, so it's editable right here rather than only through a bulk
 * re-import (see /personnel's "Importer" button for that). */
export function AffectationField({
  employeId,
  affectation,
}: {
  employeId: number;
  affectation: Affectation | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [categorie, setCategorie] = useState(affectation?.categorie ?? "");
  const [regie, setRegie] = useState(affectation?.regie ?? "");
  const [poleTechSupport, setPoleTechSupport] = useState(affectation?.poleTechSupport ?? "");
  const [classification, setClassification] = useState(affectation?.classification ?? "");
  const [typeProjet, setTypeProjet] = useState(affectation?.typeProjet ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/personnel/${employeId}/affectation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categorie: categorie || null,
          regie: regie || null,
          poleTechSupport: poleTechSupport || null,
          classification: classification || null,
          typeProjet: typeProjet || null,
        }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg bg-bg px-3 py-2.5 md:col-span-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gm">
            Affectation (fichier consolidé du personnel)
          </div>
          <button onClick={() => setEditing(true)} className="text-[11px] font-medium text-v hover:underline">
            Modifier
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] font-medium text-nb sm:grid-cols-3">
          <div>
            <span className="text-gm">Pôle : </span>
            {affectation?.poleTechSupport || "—"}
          </div>
          <div>
            <span className="text-gm">Classification : </span>
            {affectation?.classification ? CLASSIFICATION_LABEL[affectation.classification] : "—"}
          </div>
          <div>
            <span className="text-gm">Type de projet : </span>
            {affectation?.typeProjet || "—"}
          </div>
          <div>
            <span className="text-gm">Régie : </span>
            {affectation?.regie || "—"}
          </div>
          <div className="sm:col-span-2">
            <span className="text-gm">Catégorie : </span>
            {affectation?.categorie || "—"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-v/20 bg-white px-3 py-2.5 md:col-span-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gm">
        Affectation (fichier consolidé du personnel)
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px] text-gm">
          Pôle
          <input
            list="pole-options"
            value={poleTechSupport}
            onChange={(e) => setPoleTechSupport(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2 py-1.5 text-xs text-nb outline-none focus:border-v"
          />
          <datalist id="pole-options">
            <option value="Technique" />
            <option value="Support administratif" />
            <option value="Direction" />
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-gm">
          Classification
          <select
            value={classification}
            onChange={(e) => setClassification(e.target.value as "" | "regie" | "hors_regie")}
            className="rounded-lg border border-v/15 bg-bg px-2 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">—</option>
            <option value="regie">Régie</option>
            <option value="hors_regie">Hors régie</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-gm">
          Type de projet
          <input
            list="type-projet-options"
            value={typeProjet}
            onChange={(e) => setTypeProjet(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2 py-1.5 text-xs text-nb outline-none focus:border-v"
          />
          <datalist id="type-projet-options">
            <option value="Regie" />
            <option value="Forfait" />
            <option value="Exploitation" />
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-gm">
          Régie
          <input
            value={regie}
            onChange={(e) => setRegie(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2 py-1.5 text-xs text-nb outline-none focus:border-v"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-gm sm:col-span-2">
          Catégorie
          <input
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2 py-1.5 text-xs text-nb outline-none focus:border-v"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-v px-2.5 py-1 text-[11px] font-medium text-white hover:bg-vm disabled:opacity-60"
        >
          Enregistrer
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={saving}
          className="rounded-md px-2.5 py-1 text-[11px] text-gm"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
