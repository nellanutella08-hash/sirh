import "server-only";
import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";
import type { Employe, Enterprise } from "@/lib/data";
import type { EntiteLegalInfo, DocumentRequest } from "@/lib/db";
import { buildLetterParagraphs } from "@/lib/documentTemplates";
import { fmtDate } from "@/lib/format";
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

/** Same manual reference-card fallback shown on-screen (DocumentLetter)
 * for a type with no predefined model — a plain letter would risk stating
 * something wrong, so this stays deliberately bare. */
function fallbackContent(typeDocument: string, employe: Employe, enterprise: Enterprise): { title: string; paragraphs: string[] } {
  const civ = civilite(employe.genre);
  const nomComplet = `${civ ? civ + " " : ""}${employe.fullname}`;
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
  /** Overrides the auto-generated title/paragraphs — what "Modifier" on the
   * generation page produced, so the sent PDF matches exactly what RH
   * reviewed/edited on screen instead of silently re-deriving from the
   * template. */
  override?: { title: string; paragraphs: string[] };
  /** Vertical nudge (mm) for the signature/cachet block, set via the
   * "Modifier" step's ↑/↓ controls — lets RH pull it up when the letter is
   * short (avoiding a signature stranded far from the text) or push it down
   * to clear a long body, instead of the fixed gap always used before. */
  signatureOffsetMm?: number;
}): Promise<Buffer> {
  const { typeDocument, employe, enterprise, legal, request, override } = params;
  const signatureOffsetMm = Math.max(-30, Math.min(120, params.signatureOffsetMm ?? 0));
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
  const { title, paragraphs } =
    override ??
    buildLetterParagraphs(typeDocument, employe, enterprise, legal, request) ??
    fallbackContent(typeDocument, employe, enterprise);
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
  doc.setTextColor(28, 27, 46);
  for (const para of paragraphs) {
    const lines = doc.splitTextToSize(pdfSafe(para), contentWidth);
    doc.text(lines, marginX, y);
    y += lines.length * 5 + 4;
  }

  // Signature block — cachet and signature juxtaposed, bottom-right,
  // matching the on-screen preview's layout.
  y += 10 + signatureOffsetMm;
  const rightX = pageWidth - marginX;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(28, 27, 46);
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
    doc.setTextColor(110, 105, 133);
    const lines = doc.splitTextToSize(pdfSafe(footerText), contentWidth);
    doc.text(lines, pageWidth / 2, footerY, { align: "center" });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
