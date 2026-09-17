import "server-only";
import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";

// Same NBSP/narrow-no-break-space bug as lib/rapportPdf.ts: French text can
// carry U+00A0/U+202F which breaks jsPDF's WinAnsi encoding and renders as
// garbled stretched text — strip it before anything reaches doc.text().
// KPI cibles here also carry ≤/≥ (e.g. "≤ 2%"), another WinAnsi gap, so
// those get a plain-ASCII stand-in rather than stripped outright.
function pdfSafe(text: string): string {
  return (text ?? "")
    .replace(/[    ﻿]/g, " ")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=");
}

const MARGIN_X = 16;
const CONTENT_WIDTH = 178; // A4 width (210mm) minus both margins
// Charte graphique Synelia v6.3 : Violet Synelia #6759A2, Violet Profond
// #453A78, Violet Brume #EDEAF6, Gris Clair #F4F3F8, Encre #1C1B2E, Gris
// Texte #6E6985.
const HEADER_VIOLET: [number, number, number] = [103, 89, 162];
const TITLE_VIOLET: [number, number, number] = [69, 58, 120];
const IDENT_BG: [number, number, number] = [237, 234, 246];
const ZEBRA_BG: [number, number, number] = [244, 243, 248];
const TEXT: [number, number, number] = [28, 27, 46];
const MUTED: [number, number, number] = [110, 105, 133];
const LINE_H = 4.6;
const FOOTER_Y_OFFSET = 12; // from bottom of page
const PAGE_BOTTOM_LIMIT = 22; // leave room for the footer below any content/table row

const LOGO_SRC = "/logos/synelia.png";

function loadLogoDataUri(): string | null {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", LOGO_SRC.replace(/^\//, "")));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

interface Column {
  header: string;
  key: string;
  width: number;
  /** Rendered bold + violet, right-aligned-ish emphasis (Axe, Échéance, Niveau attendu, Critère). */
  emphasize?: boolean;
}

function drawLogo(doc: jsPDF, logoDataUri: string | null) {
  if (!logoDataUri) return;
  try {
    doc.addImage(logoDataUri, "PNG", MARGIN_X, 10, 28, 9.5);
  } catch {
    // best-effort — a corrupt/missing logo shouldn't break the PDF
  }
}

function drawFooter(doc: jsPDF, annee: string) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = pageHeight - FOOTER_Y_OFFSET;
  doc.setDrawColor(...HEADER_VIOLET);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y - 4, MARGIN_X + CONTENT_WIDTH, y - 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...HEADER_VIOLET);
  doc.text("SYNELIA GROUP · CAPITAL HUMAIN", MARGIN_X, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(pdfSafe(`Fiche d'objectifs ${annee}`), MARGIN_X + CONTENT_WIDTH, y, { align: "right" });
}

function ensureSpace(doc: jsPDF, y: number, needed: number, logoDataUri: string | null): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - PAGE_BOTTOM_LIMIT) {
    doc.addPage();
    drawLogo(doc, logoDataUri);
    return 32;
  }
  return y;
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...TITLE_VIOLET);
  doc.text(pdfSafe(text), MARGIN_X, y);
  return y + 7;
}

/** Draws a wrapping, paginating, zebra-striped table — jsPDF has no grid
 * primitive of its own, so each cell's text is wrapped to its column width
 * and every row's height follows its tallest cell. No pondération/score
 * columns here on purpose: this PDF is what's emailed to the
 * collaborateur, and points stay manager/RH-only per the SIRH's own
 * display rule. */
function drawTable(
  doc: jsPDF,
  columns: Column[],
  rows: Record<string, string>[],
  y: number,
  logoDataUri: string | null
): number {
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);
  let x = MARGIN_X;
  const colX: number[] = [];
  for (const c of columns) {
    colX.push(x);
    x += c.width;
  }

  function drawHeader(yy: number): number {
    doc.setFillColor(...HEADER_VIOLET);
    doc.rect(MARGIN_X, yy, totalWidth, 6.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    columns.forEach((c, i) => doc.text(pdfSafe(c.header), colX[i] + 2, yy + 4.4));
    return yy + 6.5;
  }

  y = ensureSpace(doc, y, 12, logoDataUri);
  y = drawHeader(y);

  rows.forEach((row, rowIndex) => {
    const wrapped = columns.map((c) => doc.splitTextToSize(pdfSafe(row[c.key] ?? ""), c.width - 4) as string[]);
    const rowHeight = Math.max(...wrapped.map((lines) => lines.length)) * LINE_H + 3;

    if (y + rowHeight > doc.internal.pageSize.getHeight() - PAGE_BOTTOM_LIMIT) {
      doc.addPage();
      drawLogo(doc, logoDataUri);
      y = 32;
      y = drawHeader(y);
    }

    if (rowIndex % 2 === 1) {
      doc.setFillColor(...ZEBRA_BG);
      doc.rect(MARGIN_X, y, totalWidth, rowHeight, "F");
    }

    columns.forEach((c, i) => {
      doc.setFont("helvetica", c.emphasize ? "bold" : "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...(c.emphasize ? HEADER_VIOLET : TEXT));
      doc.text(wrapped[i], colX[i] + 2, y + LINE_H);
    });
    y += rowHeight;
  });

  return y + 6;
}

export interface FicheObjectifsPdfData {
  employeNom: string;
  employePrenom?: string;
  poste: string;
  departement: string;
  responsableNom: string;
  annee: string;
  objectifs: { numero: number; axe: string; objectif: string; livrables: string; kpi: string; cible: string; echeance: string }[];
  softSkills: { libelle: string; description: string; niveauAttendu: string }[];
}

const NIVEAU_LABEL: Record<string, string> = {
  initie: "Initié(e)",
  autonome: "Autonome",
  avance: "Avancé",
  expert: "Expert(e)",
};

export function renderFicheObjectifsPdf(data: FicheObjectifsPdfData): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logoDataUri = loadLogoDataUri();
  let y = 20;

  drawLogo(doc, logoDataUri);
  y = 34;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...TITLE_VIOLET);
  doc.text(`Fiche d'objectifs ${pdfSafe(data.annee)}`, MARGIN_X + CONTENT_WIDTH / 2, y, { align: "center" });
  y += 6;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  const prenom = data.employePrenom || data.employeNom;
  doc.text(
    pdfSafe(`Une feuille de route claire pour accompagner ${prenom} tout au long de l'année, dans un esprit de progression continue.`),
    MARGIN_X + CONTENT_WIDTH / 2,
    y,
    { align: "center" }
  );
  y += 9;

  const identite = [
    ["Collaborateur", data.employeNom],
    ["Poste", data.poste || "—"],
    ["Département", data.departement || "—"],
    ["Responsable", data.responsableNom],
  ];
  const identBoxHeight = identite.length * 7 + 4;
  doc.setFillColor(...IDENT_BG);
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, identBoxHeight, 2, 2, "F");
  let identY = y + 6.5;
  for (const [label, value] of identite) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...TITLE_VIOLET);
    doc.text(label, MARGIN_X + 5, identY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT);
    doc.text(pdfSafe(value), MARGIN_X + 55, identY);
    identY += 7;
  }
  y += identBoxHeight + 8;

  y = sectionTitle(doc, "Objectifs", y);
  y = drawTable(
    doc,
    [
      { header: "N°", key: "numero", width: 8 },
      { header: "Axe", key: "axe", width: 30, emphasize: true },
      { header: "Objectif", key: "objectif", width: 40 },
      { header: "Livrables attendus", key: "livrables", width: 42 },
      { header: "KPI / Cible", key: "kpi", width: 38 },
      { header: "Échéance", key: "echeance", width: 20, emphasize: true },
    ],
    data.objectifs.map((o) => ({
      numero: String(o.numero),
      axe: o.axe,
      objectif: o.objectif,
      livrables: o.livrables,
      kpi: o.cible ? `${o.kpi} (cible : ${o.cible})` : o.kpi,
      echeance: o.echeance,
    })),
    y,
    logoDataUri
  );

  y = ensureSpace(doc, y, 20, logoDataUri);
  y = sectionTitle(doc, "Savoir-être attendu", y);
  y = drawTable(
    doc,
    [
      { header: "Critère", key: "libelle", width: 45, emphasize: true },
      { header: "Comportements attendus", key: "description", width: 105 },
      { header: "Niveau attendu", key: "niveau", width: 28, emphasize: true },
    ],
    data.softSkills.map((s) => ({
      libelle: s.libelle,
      description: s.description,
      niveau: NIVEAU_LABEL[s.niveauAttendu] ?? s.niveauAttendu,
    })),
    y,
    logoDataUri
  );

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    "Document généré par le SIRH — les pondérations et l'évaluation de ces objectifs seront communiquées lors de la campagne d'évaluation.",
    MARGIN_X,
    y,
    { maxWidth: CONTENT_WIDTH }
  );

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, data.annee);
  }

  return Buffer.from(doc.output("arraybuffer"));
}
