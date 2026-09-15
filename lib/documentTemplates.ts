// Plain, client-safe module — no "server-only" import, deliberately, so it
// can be shared between the server-side PDF generator (lib/documentPdf.ts)
// and the editable on-screen preview (components/DocumentLetter.tsx),
// which needs the exact same default text to pre-fill "Modifier". Only
// `import type` on Employe/Enterprise/EntiteLegalInfo/DocumentRequest
// (erased at compile time, so their host modules' "server-only" guards
// never actually run in a client bundle).
import type { Employe, Enterprise } from "@/lib/data";
import type { EntiteLegalInfo, DocumentRequest } from "@/lib/db";
import { fmtDate, fmtFCFA } from "@/lib/format";

function civilite(genre: string): string {
  if (genre === "F") return "Madame";
  if (genre === "M") return "Monsieur";
  return "";
}

function fmtNombre(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}

export function identiteParagraph(enterprise: Enterprise, legal: EntiteLegalInfo | null): string {
  if (!legal) {
    return (
      `Nous soussignés, ${enterprise.nom}` +
      `${enterprise.rccm ? `, RCCM ${enterprise.rccm}` : ""}` +
      `${enterprise.adresse ? `, sise à ${enterprise.adresse}` : ""},`
    );
  }
  const habilite = legal.representantCivilite === "Madame" ? "habilitée" : "habilité";
  return (
    `Nous soussignés, ${legal.raisonSociale}` +
    `${legal.formeJuridique ? `, ${legal.formeJuridique}` : ""}` +
    `${
      legal.capitalFcfa != null
        ? ` au capital de ${legal.capitalLettres ?? fmtNombre(legal.capitalFcfa)} (${fmtNombre(legal.capitalFcfa)}) francs CFA`
        : ""
    }` +
    `, ayant son siège social à ${legal.siege}, immatriculée au Registre du Commerce et du Crédit Mobilier ` +
    `sous le numéro ${legal.rccm}, Compte Contribuable numéro ${legal.compteContribuable} — Téléphone : ${legal.telephone}, ` +
    `représentée par ${legal.representantCivilite} ${legal.representantNom}, ${legal.representantTitre}, dûment ${habilite} aux fins des présentes,`
  );
}

/** Document types this app knows how to draft a real letter for — every
 * other DOCUMENT_TYPES entry (lib/db.ts) falls back to a plain reference
 * card RH fills in by hand (see the manual-fallback UI in DocumentLetter/
 * documentPdf) rather than a fabricated, possibly-wrong letter. */
export const TYPES_AVEC_MODELE = [
  "Attestation de travail",
  "Attestation de prise en charge",
  "Ordre de mission",
  "Certificat de travail",
  "Certificat/attestation de consultance",
  "Attestation de versement d'honoraires",
  "Attestation de stage",
  "Attestation de salaire",
  "Lettre de recommandation",
] as const;

/** Returns the default title + body paragraphs for a document type, or
 * null when there's no predefined model (see TYPES_AVEC_MODELE) — the
 * single source of truth for both the "Modifier" preview's starting text
 * and the actual PDF that gets sent, so editing one always matches what
 * was actually generated. */
export function buildLetterParagraphs(
  typeDocument: string,
  employe: Employe,
  enterprise: Enterprise,
  legal: EntiteLegalInfo | null,
  request?: DocumentRequest
): { title: string; paragraphs: string[] } | null {
  const civ = civilite(employe.genre);
  const nomComplet = `${civ ? civ + " " : ""}${employe.fullname}`;
  const ilElle = civ === "Madame" ? "elle" : civ === "Monsieur" ? "il" : "l'intéressé(e)";
  const raisonSociale = legal?.raisonSociale || enterprise.nom;
  const identite = identiteParagraph(enterprise, legal);

  if (typeDocument === "Attestation de travail") {
    return {
      title: "Attestation de travail",
      paragraphs: [
        identite,
        `Attestons par la présente que ${nomComplet}${employe.contractNumber ? ` (Matricule : ${employe.contractNumber})` : ""} est employé(e) au sein de notre société${employe.dateEntree ? ` depuis le ${fmtDate(employe.dateEntree)}` : ""}, en qualité de ${employe.fonction}.`,
        `En foi de quoi, la présente attestation lui est délivrée pour servir et faire valoir ce que de droit.`,
      ],
    };
  }

  if (typeDocument === "Attestation de prise en charge") {
    return {
      title: "Attestation de prise en charge",
      paragraphs: [
        identite,
        `Nous engageons par la présente à subvenir à tous les besoins (nourriture, entretien, frais de transport, frais d'hospitalisation ou de soins médicaux et divers) de ${nomComplet}, ${employe.dateNaissance ? `né(e) le ${fmtDate(employe.dateNaissance)} ` : ""}${request?.lieuNaissance ? `à ${request.lieuNaissance} ` : ""}pendant toute la durée de son séjour ${request?.destination ? `à ${request.destination} ` : ""}${request?.dateDebut ? `du ${fmtDate(request.dateDebut)} ` : ""}${request?.dateFin ? `au ${fmtDate(request.dateFin)} ` : ""}sans avoir recours aux aides publiques, attestant pour ce faire avoir les ressources suffisantes.`,
      ],
    };
  }

  if (typeDocument === "Ordre de mission") {
    return {
      title: "Ordre de mission",
      paragraphs: [
        identite,
        `Autorisons par la présente ${nomComplet}, ${employe.fonction}, à effectuer une mission de travail ${request?.destination ? `à ${request.destination}` : ""}.`,
        `Date de départ : ${fmtDate(request?.dateDebut ?? null)}`,
        `Date de retour : ${fmtDate(request?.dateFin ?? null)}`,
        `Objet : ${request?.objet || "—"}`,
        `Les frais de cette mission sont totalement pris en charge par ${raisonSociale}.`,
        `En foi de quoi, la présente est délivrée à l'intéressé(e) pour servir et faire valoir ce que de droit.`,
      ],
    };
  }

  if (typeDocument === "Certificat de travail") {
    return {
      title: "Certificat de travail",
      paragraphs: [
        identite,
        `Certifions que ${nomComplet} a été employé(e) au sein de notre société${employe.dateEntree ? ` du ${fmtDate(employe.dateEntree)} à ce jour` : ""}, en qualité de ${employe.fonction}.`,
        `Ce certificat est établi pour servir et faire valoir ce que de droit.`,
      ],
    };
  }

  if (typeDocument === "Certificat/attestation de consultance") {
    return {
      title: "Attestation de consultance",
      paragraphs: [
        identite,
        `Attestons par la présente que ${nomComplet}${employe.contractNumber ? ` (Matricule : ${employe.contractNumber})` : ""} est titulaire d'un contrat de consultance au sein de notre société${employe.dateEntree ? ` depuis le ${fmtDate(employe.dateEntree)}` : ""}, en qualité de ${employe.fonction}.`,
        `En foi de quoi, la présente attestation lui est délivrée pour servir et faire valoir ce que de droit.`,
      ],
    };
  }

  if (typeDocument === "Attestation de versement d'honoraires") {
    const montant = request?.montantHonoraires ?? employe.salNet;
    return {
      title: "Attestation de versement d'honoraires",
      paragraphs: [
        identite,
        `Attestons par la présente que ${nomComplet}${employe.contractNumber ? ` (Matricule : ${employe.contractNumber})` : ""}, titulaire d'un contrat de consultance${request?.dateSignatureContrat ? ` signé le ${fmtDate(request.dateSignatureContrat)}` : ""}, effectuant${employe.dateEntree ? ` depuis le ${fmtDate(employe.dateEntree)}` : ""} une mission de prestation pour notre compte, perçoit des honoraires mensuels d'un montant net de ${fmtFCFA(montant)}, versés par virement bancaire à la fin de chaque mois.`,
        `En foi de quoi, la présente attestation lui est délivrée pour servir et faire valoir ce que de droit.`,
      ],
    };
  }

  if (typeDocument === "Attestation de stage") {
    return {
      title: "Attestation de stage",
      paragraphs: [
        identite,
        `Attestons par la présente que ${nomComplet} a effectué un stage au sein de notre société${employe.dateEntree ? ` du ${fmtDate(employe.dateEntree)}` : ""}${employe.dateFin ? ` au ${fmtDate(employe.dateFin)}` : ""}, en qualité de ${employe.fonction}.`,
        `Durant cette période, ${ilElle} a fait preuve de sérieux et d'assiduité dans les missions qui lui ont été confiées.`,
        `En foi de quoi, la présente attestation lui est délivrée pour servir et faire valoir ce que de droit.`,
      ],
    };
  }

  if (typeDocument === "Attestation de salaire") {
    return {
      title: "Attestation de salaire",
      paragraphs: [
        identite,
        `Attestons par la présente que ${nomComplet}${employe.contractNumber ? ` (Matricule : ${employe.contractNumber})` : ""} est employé(e) au sein de notre société${employe.dateEntree ? ` depuis le ${fmtDate(employe.dateEntree)}` : ""}, en qualité de ${employe.fonction}, et perçoit à ce titre un salaire mensuel net de ${fmtFCFA(employe.salNet)}.`,
        `En foi de quoi, la présente attestation lui est délivrée pour servir et faire valoir ce que de droit.`,
      ],
    };
  }

  if (typeDocument === "Lettre de recommandation") {
    return {
      title: "Lettre de recommandation",
      paragraphs: [
        identite,
        `Nous recommandons ${nomComplet}, qui a occupé${employe.dateEntree ? ` depuis le ${fmtDate(employe.dateEntree)}` : ""} le poste de ${employe.fonction} au sein de notre société.`,
        `Durant cette collaboration, nous avons pu apprécier son sérieux, son professionnalisme et la qualité de son travail.`,
        `Nous recommandons sa candidature sans réserve pour tout poste correspondant à son profil.`,
      ],
    };
  }

  return null;
}
