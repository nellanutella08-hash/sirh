"use client";

import { useMemo, useState } from "react";
import type { Employe, Enterprise } from "@/lib/data";
import type { EntiteLegalInfo, DocumentRequest, DocumentRequestStatut } from "@/lib/db";
import { buildLetterParagraphs, identiteParagraph } from "@/lib/documentTemplates";
import { DocumentLetterPreview } from "@/components/DocumentLetterPreview";

type ProfilKey = "cdi" | "cdd" | "consultant" | "stagiaire";

const PROFIL_LABEL: Record<ProfilKey, string> = {
  cdi: "CDI",
  cdd: "CDD",
  consultant: "Consultant(e)",
  stagiaire: "Stagiaire",
};

const MOCK_BASE: Record<ProfilKey, { fonction: string; contratType: string; dateEntree: string; dateFin: string | null; salNet: number; salBrut: number }> = {
  cdi: {
    fonction: "Chargé(e) de projets",
    contratType: "CDI",
    dateEntree: "2022-03-01",
    dateFin: null,
    salNet: 450000,
    salBrut: 600000,
  },
  cdd: {
    fonction: "Assistant(e) administratif(ve)",
    contratType: "CDD",
    dateEntree: "2024-06-01",
    dateFin: "2025-12-31",
    salNet: 280000,
    salBrut: 350000,
  },
  consultant: {
    fonction: "Consultant(e) en stratégie",
    contratType: "Consultant",
    dateEntree: "2023-09-01",
    dateFin: null,
    salNet: 900000,
    salBrut: 900000,
  },
  stagiaire: {
    fonction: "Stagiaire RH",
    contratType: "Stagiaire",
    dateEntree: "2025-01-06",
    dateFin: "2025-07-04",
    salNet: 75000,
    salBrut: 75000,
  },
};

/** A fictitious collaborateur/collaboratrice, one per contract profile —
 * never a real employé, so this preview never depends on (or risks
 * leaking) real personal data. Alternates genre so both civilité forms
 * ("Madame"/"Monsieur") get exercised across profiles. */
function buildMockEmploye(profil: ProfilKey, enterprise: Enterprise): Employe {
  const base = MOCK_BASE[profil];
  const genre = profil === "cdd" || profil === "stagiaire" ? "F" : "M";
  return {
    id: -1,
    nom: genre === "F" ? "KONE" : "DIALLO",
    prenoms: genre === "F" ? "Aïcha" : "Moussa",
    fullname: genre === "F" ? "KONE Aïcha" : "DIALLO Moussa",
    email: "exemple@synelia.tech",
    username: "exemple",
    genre,
    dateNaissance: "1995-05-12",
    dateEntree: base.dateEntree,
    statutMatrimonial: null,
    nationality: "Ivoirienne",
    entiteId: enterprise.id,
    entite: enterprise.nom,
    fonction: base.fonction,
    contratType: base.contratType,
    contratActif: true,
    salNet: base.salNet,
    salBrut: base.salBrut,
    dateDebut: base.dateEntree,
    dateFin: base.dateFin,
    alerte: "ok",
    actif: true,
    contractNumber: "EXEMPLE-0001",
    photoUrl: null,
    telephone: null,
    managerId: null,
    managerNom: null,
  };
}

function buildMockRequest(typeDocument: string, employe: Employe): DocumentRequest {
  const now = new Date().toISOString();
  const isOrdreMission = typeDocument === "Ordre de mission";
  const isPriseEnCharge = typeDocument === "Attestation de prise en charge";
  const isHonoraires = typeDocument === "Attestation de versement d'honoraires";
  return {
    id: "apercu",
    tenantId: 0,
    employeId: employe.id,
    employeNom: employe.fullname,
    typeDocument,
    statut: "demandee" as DocumentRequestStatut,
    commentaire: null,
    filePath: null,
    destination: isOrdreMission ? "Ouagadougou, Burkina Faso" : isPriseEnCharge ? "France" : null,
    dateDebut: isOrdreMission || isPriseEnCharge ? "2026-01-10" : null,
    dateFin: isOrdreMission || isPriseEnCharge ? "2026-01-17" : null,
    objet: isOrdreMission ? "Réunion de lancement de projet" : null,
    lieuNaissance: isPriseEnCharge ? "Abidjan" : null,
    montantHonoraires: isHonoraires ? employe.salNet : null,
    dateSignatureContrat: isHonoraires ? "2023-09-01" : null,
    createdAt: now,
    updatedAt: now,
  };
}

export function ApercuModeles({
  documentTypes,
  entites,
}: {
  documentTypes: string[];
  entites: { enterprise: Enterprise; legal: EntiteLegalInfo | null }[];
}) {
  const [typeDocument, setTypeDocument] = useState(documentTypes[0] ?? "");
  const [profil, setProfil] = useState<ProfilKey>("cdi");
  const [entiteIndex, setEntiteIndex] = useState(0);

  const entite = entites[entiteIndex];

  const { employe, built } = useMemo(() => {
    if (!entite) return { employe: null, built: null };
    const employe = buildMockEmploye(profil, entite.enterprise);
    const request = buildMockRequest(typeDocument, employe);
    const built = buildLetterParagraphs(typeDocument, employe, entite.enterprise, entite.legal, request);
    return { employe, built };
  }, [typeDocument, profil, entite]);

  if (!entite || !employe) {
    return (
      <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-sm text-gm">
        Aucune entité trouvée dans Neos — impossible de prévisualiser un modèle sans letterhead.
      </div>
    );
  }

  const title = built?.title ?? typeDocument;
  const paragraphs =
    built?.paragraphs ?? [identiteParagraph(entite.enterprise, entite.legal), `Concernant ${employe.fullname} (${employe.fonction}) — texte à rédiger avant l'envoi.`];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_1fr]">
      <div className="flex h-fit flex-col gap-4 rounded-[14px] border border-v/10 bg-white p-4">
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-gm">Type de document</div>
          <select
            value={typeDocument}
            onChange={(e) => setTypeDocument(e.target.value)}
            className="w-full rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v"
          >
            {documentTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-gm">Profil (type de contrat)</div>
          <select
            value={profil}
            onChange={(e) => setProfil(e.target.value as ProfilKey)}
            className="w-full rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v"
          >
            {(Object.keys(PROFIL_LABEL) as ProfilKey[]).map((p) => (
              <option key={p} value={p}>
                {PROFIL_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-gm">Entité (letterhead)</div>
          <select
            value={entiteIndex}
            onChange={(e) => setEntiteIndex(Number(e.target.value))}
            className="w-full rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v"
          >
            {entites.map((e, i) => (
              <option key={e.enterprise.id} value={i}>
                {e.enterprise.nom}
              </option>
            ))}
          </select>
        </div>

        {built ? (
          <div className="rounded-lg bg-sc/10 px-3 py-2 text-[11px] text-[#0E7A50]">
            ✓ Modèle prédéfini pour ce type.
          </div>
        ) : (
          <div className="rounded-lg bg-wn/10 px-3 py-2 text-[11px] text-[#8F5500]">
            ⚠ Pas de modèle — texte générique de secours affiché ci-contre.
          </div>
        )}
        <p className="text-[10px] text-gm">
          Collaborateur(trice) fictif(ve) — uniquement pour relire le rendu, jamais une vraie personne.
        </p>
      </div>

      <div className="rounded-[14px] border border-v/10 bg-white p-12">
        <DocumentLetterPreview
          typeDocument={typeDocument}
          enterprise={entite.enterprise}
          legal={entite.legal}
          mode="numerique"
          title={title}
          paragraphs={paragraphs}
        />
      </div>
    </div>
  );
}
