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

/** Defaults pulled from the real Word templates per entité (see the
 * "Modèles documents administratifs et contrats" Nextcloud folder) — pre-
 * fills the form so RH only has to verify/correct instead of typing
 * everything from scratch. Matched by entité name; unmatched entités just
 * start blank. Order matters: the more specific Synelia patterns (Burkina,
 * Bénin) must be checked before the bare "SYNELIA" one. */
const DEFAULTS_BY_NAME: { pattern: RegExp; info: Omit<EntiteLegalInfo, "raisonSociale"> }[] = [
  {
    pattern: /BURKINA/i,
    info: {
      formeJuridique: "",
      capitalFcfa: 1_000_000,
      capitalLettres: "un million",
      siege: "Ouagadougou, Section VM, Secteur 43, 01 BP 5841 Ouaga",
      rccm: "BFOUA2021B13657",
      compteContribuable: "",
      telephone: "+226 06 34 03 30 / +226 25 38 03 52",
      representantCivilite: "Monsieur",
      representantNom: "Vilanova Jorge Adelino",
      representantTitre: "l'Administrateur Général",
      signataireTitre: "Ressources Humaines",
      villeSignature: "Ouagadougou",
      piedDePage:
        "Synelia -BF au capital de 1 000 000 FCFA siège social Ouagadougou Section VM, Secteur 43, 01 BP 5841 OUAGA — Tél : +226 06-34-03-30 / +226 25-38-03-52",
    },
  },
  {
    pattern: /B[EÉ]NIN/i,
    info: {
      formeJuridique: "Société A Responsabilité Limitée",
      capitalFcfa: 1_000_000,
      capitalLettres: "un million",
      siege: "Cotonou, Haie Vive, Les Cocotiers, c/1177 A",
      rccm: "RB/COT/24 B 37001",
      compteContribuable: "IFU 3202449912897",
      telephone: "01 97 57 89 14",
      representantCivilite: "Monsieur",
      representantNom: "Jules Houantonon",
      representantTitre: "le Gérant",
      signataireTitre: "Ressources Humaines",
      villeSignature: "Abidjan",
      piedDePage:
        "SYNELIA BENIN, au capital de 1 000 000 FCFA. Siège Social : M/DJIMADJA COTONOU, HAIE VIVE - LES COCOTIER — IFU 3202449912897 — avs@synelia.tech — www.synelia.tech",
    },
  },
  {
    pattern: /SWANTECH|SWAN TECH/i,
    info: {
      formeJuridique: "Société A Responsabilité Limitée",
      capitalFcfa: 5_000_000,
      capitalLettres: "cinq millions",
      siege: "Abidjan Cocody-Angré 7ème Tranche, 04 BP 1309 Abidjan 04",
      rccm: "CI-ABJ-2017-B-13472",
      compteContribuable: "1725140 H",
      telephone: "07 49 06 47 89",
      representantCivilite: "Monsieur",
      representantNom: "Stéphane Armel Ouattara",
      representantTitre: "le Gérant",
      signataireTitre: "Ressources Humaines",
      villeSignature: "Abidjan",
      piedDePage:
        "SWAN TECHNOLOGIES SARL au capital de 5 000 000 FCFA — Siège social : Abidjan, Cocody Angré 7ème Tranche, 04 BP 1309 Abidjan 04. RCCM : CI-ABJ-2017-B-13472 — CC : 1725140 H — Tél : 07 49 06 47 89 — Compte bancaire : CI 121 01301 032019600201 44",
    },
  },
  {
    pattern: /SYNERTECH/i,
    info: {
      formeJuridique: "Société A Responsabilité Limitée",
      capitalFcfa: 10_000_000,
      capitalLettres: "dix millions",
      siege: "Abidjan Cocody Angré 7ème Tranche, 06 BP 169 Abidjan 06",
      rccm: "CI-ABJ-2020-B-08796",
      compteContribuable: "2026725 P",
      telephone: "27 22 51 60 10",
      representantCivilite: "Monsieur",
      representantNom: "Ouattara Aboubacar Sidiki",
      representantTitre: "le Gérant",
      signataireTitre: "Ressources Humaines",
      villeSignature: "Abidjan",
      piedDePage:
        "SYNERTECH SARL au capital de 10 000 000 FCFA. Siège Social : Cocody Angré 7ème tranche 06 BP 169 Abidjan 06 — Tél/Fax : 27 22 51 60 10 — email : info@synertech-ci.net — RC N° CI-ABJ-2020-B-08796 — CC N°2026725 P",
    },
  },
  {
    pattern: /K-?S[\s-]?SERVICES?/i,
    info: {
      formeJuridique: "Entreprise Individuelle",
      capitalFcfa: null,
      capitalLettres: null,
      siege: "Abidjan, II Plateaux Vallon, 06 BP 169 Abidjan 06",
      rccm: "CI-ABJ-2020-A-13050",
      compteContribuable: "151 5490 P",
      telephone: "07 08 13 90 36",
      representantCivilite: "Madame",
      representantNom: "Cingal Sonia Lydie épse Kouassi",
      representantTitre: "l'Exploitant",
      signataireTitre: "Ressources Humaines",
      villeSignature: "Abidjan",
      piedDePage:
        "KS-SERVICES, Entreprise Individuelle. Siège social : Abidjan, II Plateaux Vallon, 06 BP 169 Abidjan 06 — RCCM CI-ABJ-2020-A-13050 — Compte Contribuable 151 5490 P — Téléphone : 07 08 13 90 36",
    },
  },
  {
    pattern: /SYNELIA/i,
    info: {
      formeJuridique: "Société Anonyme",
      capitalFcfa: 100_000_000,
      capitalLettres: "cent millions",
      siege: "Abidjan Cocody-Angré 7ème Tranche, 06 BP 2175 Abidjan 06",
      rccm: "CI-ABJ-2020-B-04990",
      compteContribuable: "201 7191 G",
      telephone: "27 22 51 60 10",
      representantCivilite: "Monsieur",
      representantNom: "Vilanova Jorge Adelino",
      representantTitre: "l'Administrateur Général",
      signataireTitre: "Ressources Humaines",
      villeSignature: "Abidjan",
      // Note: the real letterhead's footer literally reads "CI-ABJ-03-2020-B-04990"
      // (with an extra "03-"), unlike the RCCM used in the body/identity
      // paragraph ("CI-ABJ-2020-B-04990") — reproduced verbatim from the
      // template rather than silently "corrected", since it's what's
      // actually printed on the real stationery.
      piedDePage:
        "SYNELIA GROUP AFRIQUE, SA au capital de 100 000 000 FCFA. Siège Social : Cocody Angré 7ème tranche 06 BP 2175 Abidjan 06. RCCM CI-ABJ-03-2020-B-04990 — CC : 2017191 G — Compte bancaire CI 112 01003 017026400631 05 — www.synelia.tech",
    },
  },
];

function defaultLegalInfoFor(nom: string): EntiteLegalInfo | null {
  const match = DEFAULTS_BY_NAME.find((d) => d.pattern.test(nom));
  return match ? { raisonSociale: nom, ...match.info } : null;
}

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
  const isPrefilled = !initial && defaultLegalInfoFor(entiteNom) !== null;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EntiteLegalInfo>(
    initial ?? defaultLegalInfoFor(entiteNom) ?? { ...EMPTY, raisonSociale: entiteNom }
  );
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
          {isPrefilled && !saved ? (
            <span className="ml-2 rounded-full bg-v/10 px-2 py-0.5 text-[10px] font-semibold text-v">
              Pré-rempli — à vérifier
            </span>
          ) : (
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                complet ? "bg-sc/15 text-[#0A5C3A]" : "bg-wn/15 text-[#7A4A00]"
              }`}
            >
              {complet ? "Informations complètes" : "À compléter"}
            </span>
          )}
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
              placeholder="Ressources Humaines"
            />
            <Field
              label="Ville de signature"
              value={form.villeSignature}
              onChange={(v) => set("villeSignature", v)}
              placeholder="Abidjan"
            />
          </div>

          <div className="mt-2 text-[11px] text-gm">
            Par défaut les documents sont signés par la RH — ne renseignez le nom d&apos;un
            représentant (Administrateur Général, Gérant...) au signataire que pour les cas
            particuliers où c&apos;est vraiment lui qui signe.
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
