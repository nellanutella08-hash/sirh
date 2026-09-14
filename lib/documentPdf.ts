import "server-only";
import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";
import type { Employe, Enterprise } from "@/lib/data";
import type { EntiteLegalInfo, DocumentRequest } from "@/lib/db";
import { fmtDate, fmtFCFA } from "@/lib/format";
import { documentTypeColors } from "@/components/Badge";

// A server-side twin of components/DocumentLetter.tsx: same text per
// document type, same logo/cachet/signature matching, same colored title
// frame — but drawn directly with jsPDF instead of screenshotting the
// rendered HTML. Screenshotting (html2canvas) turned out to hang on this
// stack (Tailwind v4's oklch() colors aren't parseable by html2canvas's
// old CSS engine), so the "Envoyer" button generates the PDF here, on the
// server, where it's both more reliable and produces a real (selectable,
// small) PDF rather than a rasterized image.

function civilite(genre: string): string {
  if (genre === "F") return "Madame";
  if (genre === "M") return "Monsieur";
  return "";
}

function today(): string {
  return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function fmtNombre(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}

function staticLogoFor(nom: string): string | null {
  if (/SWANTECH|SWAN TECH/i.test(nom)) return "/logos/swantech.jpeg";
  if (/SYNERTECH/i.test(nom)) return "/logos/synertech.png";
  if (/SYNELIA/i.test(nom)) return "/logos/synelia.png";
  return null;
}

function staticCachetFor(nom: string): string | null {
  if (/SWANPRO/i.test(nom)) return "/cachets/swanpro.png";
  if (/SWANTECH|SWAN TECH/i.test(nom)) return "/cachets/swantech.png";
  if (/SYNERTECH/i.test(nom)) return "/cachets/synertech.png";
  if (/K-?S[\s-]?SERVICES?/i.test(nom)) return "/cachets/ks-services.png";
  if (/BURKINA/i.test(nom)) return "/cachets/synelia-burkina.png";
  if (/SYNELIA/i.test(nom)) return "/cachets/synelia-group-afrique.png";
  return null;
}

const DEFAULT_SIGNATURE_IMG = "/signatures/rh-default.png";

async function loadImageDataUri(src: string): Promise<{ dataUri: string; format: "PNG" | "JPEG" } | null> {
  try {
    let buf: Buffer;
    if (/^https?:\/\//i.test(src)) {
      const res = await fetch(src);
      if (!res.ok) return null;
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      buf = fs.readFileSync(path.join(process.cwd(), "public", src.replace(/^\//, "")));
    }
    const ext = src.split(".").pop()?.toLowerCase();
    const format: "PNG" | "JPEG" = ext === "jpg" || ext === "jpeg" ? "JPEG" : "PNG";
    const mime = format === "JPEG" ? "image/jpeg" : "image/png";
    return { dataUri: `data:${mime};base64,${buf.toString("base64")}`, format };
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function fitBox(imgW: number, imgH: number, maxW: number, maxH: number): { w: number; h: number } {
  const ratio = Math.min(maxW / imgW, maxH / imgH);
  return { w: imgW * ratio, h: imgH * ratio };
}

// jsPDF's standard fonts can't encode the non-breaking/narrow-no-break
// spaces that Intl.NumberFormat("fr-FR") uses as thousands separators (or
// that can otherwise sneak into legal/Neos text) — a line containing one
// silently falls back to a 2-byte encoding and renders with huge gaps
// between every character. Normalize to plain spaces before any text hits
// the PDF.
function pdfSafe(text: string): string {
  return text.replace(/[\u00A0\u2007\u2009\u202F\uFEFF]/g, " ");
}

function identiteParagraph(enterprise: Enterprise, legal: EntiteLegalInfo | null): string {
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

function buildLetterContent(
  typeDocument: string,
  employe: Employe,
  enterprise: Enterprise,
  legal: EntiteLegalInfo | null,
  request?: DocumentRequest
): { title: string; paragraphs: string[] } {
  const civ = civilite(employe.genre);
  const nomComplet = `${civ ? civ + " " : ""}${employe.fullname}`;
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

  const lines = [
    `Collaborateur : ${nomComplet}`,
    `Fonction : ${employe.fonction}`,
    `Entité : ${enterprise.nom}`,
  ];
  if (employe.dateEntree) lines.push(`Date d'entrée : ${fmtDate(employe.dateEntree)}`);
  return { title: typeDocument, paragraphs: lines };
}

export async function renderDocumentPdf(params: {
  typeDocument: string;
  employe: Employe;
  enterprise: Enterprise;
  legal: EntiteLegalInfo | null;
  request?: DocumentRequest;
}): Promise<Buffer> {
  const { typeDocument, employe, enterprise, legal, request } = params;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 20;
  const contentWidth = pageWidth - marginX * 2;
  let y = 20;

  // Letterhead
  const logoSrc = enterprise.logoUrl || staticLogoFor(enterprise.nom);
  if (logoSrc) {
    const img = await loadImageDataUri(logoSrc);
    if (img) {
      const props = doc.getImageProperties(img.dataUri);
      const { w, h } = fitBox(props.width, props.height, 45, 14);
      doc.addImage(img.dataUri, img.format, marginX, y, w, h);
      y += h + 8;
    }
  }

  // Title, framed in the document type's brand color
  const { title, paragraphs } = buildLetterContent(typeDocument, employe, enterprise, legal, request);
  const { bg, fg } = documentTypeColors(typeDocument);
  const [fgR, fgG, fgB] = hexToRgb(fg);
  const [bgR, bgG, bgB] = hexToRgb(bg);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const titleText = title.toUpperCase();
  const titleWidth = doc.getTextWidth(titleText);
  const boxW = titleWidth + 12;
  const boxH = 10;
  const boxX = (pageWidth - boxW) / 2;
  doc.setFillColor(bgR, bgG, bgB);
  doc.setDrawColor(fgR, fgG, fgB);
  doc.setLineWidth(0.4);
  doc.roundedRect(boxX, y, boxW, boxH, 2, 2, "FD");
  doc.setTextColor(fgR, fgG, fgB);
  doc.text(pdfSafe(titleText), pageWidth / 2, y + boxH / 2 + 1.3, { align: "center" });
  y += boxH + 10;

  // Body
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(28, 28, 46);
  for (const para of paragraphs) {
    const lines = doc.splitTextToSize(pdfSafe(para), contentWidth);
    doc.text(lines, marginX, y);
    y += lines.length * 5 + 4;
  }

  // Signature block — cachet and signature juxtaposed, bottom-right,
  // matching the on-screen preview's layout.
  y += 10;
  const rightX = pageWidth - marginX;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(28, 28, 46);
  doc.text(pdfSafe(`Fait à ${legal?.villeSignature || "Abidjan"}, le ${today()}`), rightX, y, {
    align: "right",
  });
  y += 14;
  doc.setFont("helvetica", "bold");
  doc.text(pdfSafe(legal?.signataireTitre || "Ressources Humaines"), rightX, y, { align: "right" });
  y += 4;

  const cachetSrc = staticCachetFor(enterprise.nom);
  const cachetSize = 40;
  const sigW = 55;
  const sigH = 28;
  const boxWidth = 75;
  const rowHeight = cachetSize;
  const centerY = y + rowHeight / 2;
  if (cachetSrc) {
    const img = await loadImageDataUri(cachetSrc);
    if (img) {
      doc.addImage(img.dataUri, img.format, rightX - boxWidth, centerY - cachetSize / 2, cachetSize, cachetSize);
    }
  }
  const sigImg = await loadImageDataUri(DEFAULT_SIGNATURE_IMG);
  if (sigImg) {
    doc.addImage(sigImg.dataUri, sigImg.format, rightX - sigW, centerY - sigH / 2, sigW, sigH);
  }

  // Footer — pinned near the bottom of the page regardless of body length,
  // same as the mt-auto pinned footer in the HTML/print version.
  const footerText =
    legal?.piedDePage ||
    [enterprise.nom, enterprise.adresse, enterprise.rccm ? `RCCM : ${enterprise.rccm}` : null]
      .filter(Boolean)
      .join(" — ");
  if (footerText) {
    const footerY = pageHeight - 18;
    doc.setDrawColor(200, 200, 205);
    doc.setLineWidth(0.2);
    doc.line(marginX, footerY - 4, pageWidth - marginX, footerY - 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 130);
    const lines = doc.splitTextToSize(pdfSafe(footerText), contentWidth);
    doc.text(lines, pageWidth / 2, footerY, { align: "center" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
