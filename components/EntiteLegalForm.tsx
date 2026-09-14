"use client";

import { useState } from "react";

export interface EntiteLegalInfo {
  raisonSociale: string;
  formeJuridique: string;
  capitalFcfa: number | null;
  capitalLettres: string | null;
  siege: string;
  rccm: string;
  compteContribuable: string;
  telephone: string;
  representantCivilite: string;
  representantNom: string;
  representantTitre: string;
  signataireTitre: string;
  villeSignature: string;
  piedDePage: string;
}

const EMPTY: EntiteLegalInfo = {
  raisonSociale: "",
  formeJuridique: "",
  capitalFcfa: null,
  capitalLettres: null,
  siege: "",
  rccm: "",
  compteContribuable: "",
  telephone: "",
  representantCivilite: "Monsieur",
  representantNom: "",
  representantTitre: "",
  signataireTitre: "",
  villeSignature: "Abidjan",
  piedDePage: "",
};

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gm">{label}</div>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs outline-none focus:border-v"
      />
    </div>
  );
}

export function EntiteLegalForm({
  entiteId,
  entiteNom,
  initial,
}: {
  entiteId: number;
  entiteNom: string;
  initial: EntiteLegalInfo | null;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EntiteLegalInfo>(initial ?? { ...EMPTY, raisonSociale: entiteNom });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof EntiteLegalInfo>(key: K, value: EntiteLegalInfo[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/entites/legal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entiteId, ...form }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  const complet = Boolean(form.raisonSociale && form.rccm && form.representantNom);

  return (
    <div className="overflow-hidden rounded-[14px] border border-v/10 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <span className="text-[13px] font-semibold text-nb">{entiteNom}</span>
          <span
            className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              complet ? "bg-sc/15 text-[#0A5C3A]" : "bg-wn/15 text-[#7A4A00]"
            }`}
          >
            {complet ? "Informations complètes" : "À compléter"}
          </span>
        </div>
        <span className="text-xs text-gm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-v/10 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Raison sociale"
              value={form.raisonSociale}
              onChange={(v) => set("raisonSociale", v)}
              placeholder="SYNELIA GROUP AFRIQUE S.A"
            />
            <Field
              label="Forme juridique"
              value={form.formeJuridique}
              onChange={(v) => set("formeJuridique", v)}
              placeholder="Société Anonyme / SARL / Entreprise individuelle"
            />
            <Field
              label="Capital (FCFA, chiffres)"
              value={form.capitalFcfa != null ? String(form.capitalFcfa) : ""}
              onChange={(v) => set("capitalFcfa", v ? Number(v) : null)}
              placeholder="100000000"
            />
            <Field
              label="Capital (en lettres)"
              value={form.capitalLettres ?? ""}
              onChange={(v) => set("capitalLettres", v || null)}
              placeholder="cent millions"
            />
            <Field
              label="Siège social"
              value={form.siege}
              onChange={(v) => set("siege", v)}
              placeholder="Abidjan Cocody-Angré 7ème Tranche, 06 BP 2175 Abidjan 06"
            />
            <Field label="RCCM" value={form.rccm} onChange={(v) => set("rccm", v)} placeholder="CI-ABJ-2020-B-04990" />
            <Field
              label="Compte contribuable"
              value={form.compteContribuable}
              onChange={(v) => set("compteContribuable", v)}
              placeholder="201 7191 G"
            />
            <Field
              label="Téléphone"
              value={form.telephone}
              onChange={(v) => set("telephone", v)}
              placeholder="27 22 51 60 10"
            />
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gm">
                Civilité du représentant
              </div>
              <select
                value={form.representantCivilite}
                onChange={(e) => set("representantCivilite", e.target.value)}
                className="w-full rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs outline-none focus:border-v"
              >
                <option value="Monsieur">Monsieur</option>
                <option value="Madame">Madame</option>
              </select>
            </div>
            <Field
              label="Nom du représentant légal"
              value={form.representantNom}
              onChange={(v) => set("representantNom", v)}
              placeholder="Vilanova Jorge Adelino"
            />
            <Field
              label="Titre du représentant (dans le texte)"
              value={form.representantTitre}
              onChange={(v) => set("representantTitre", v)}
              placeholder="l'Administrateur Général"
            />
            <Field
              label="Titre du signataire (bas de page)"
              value={form.signataireTitre}
              onChange={(v) => set("signataireTitre", v)}
              placeholder="L'Administrateur Général Adjoint"
            />
            <Field
              label="Ville de signature"
              value={form.villeSignature}
              onChange={(v) => set("villeSignature", v)}
              placeholder="Abidjan"
            />
          </div>

          <div className="mt-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gm">
              Pied de page (bas de chaque document)
            </div>
            <textarea
              value={form.piedDePage}
              onChange={(e) => set("piedDePage", e.target.value)}
              rows={2}
              placeholder="SYNELIA GROUP AFRIQUE, SA au capital de 100 000 000 FCFA. Siège Social : Cocody Angré 7ème tranche 06 BP 2175 Abidjan 06. RCCM CI-ABJ-2020-B-04990 - CC : 2017191 G - Compte bancaire CI 112 01003 017026400631 05 - www.synelia.tech"
              className="w-full resize-none rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs outline-none focus:border-v"
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            {saved && <span className="text-xs text-sc">Enregistré ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}
