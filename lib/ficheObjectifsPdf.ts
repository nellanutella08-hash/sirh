import "server-only";
import { jsPDF } from "jspdf";

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
const VIOLET: [number, number, number] = [75, 40, 130];
const TEXT: [number, number, number] = [28, 28, 46];
const MUTED: [number, number, number] = [120, 120, 130];
const LINE_H = 4.6;

interface Column {
  header: string;
  key: string;
  width: number;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 16) {
    doc.addPage();
    return 20;
  }
  return y;
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  y = ensureSpace(doc, y, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...VIOLET);
  doc.text(pdfSafe(text), MARGIN_X, y);
  doc.setDrawColor(...VIOLET);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, y + 1.5, MARGIN_X + 80, y + 1.5);
  return y + 8;
}

/** Draws a wrapping, paginating table — jsPDF has no grid primitive of its
 * own, so each cell's text is wrapped to its column width and every row's
 * height follows its tallest cell. No pondération/score columns here on
 * purpose: this PDF is what's emailed to the collaborateur, and points stay
 * manager/RH-only per the SIRH's own display rule. */
function drawTable(doc: jsPDF, columns: Column[], rows: Record<string, string>[], y: number): number {
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);
  let x = MARGIN_X;
  const colX: number[] = [];
  for (const c of columns) {
    colX.push(x);
    x += c.width;
  }

  function drawHeader(yy: number): number {
    doc.setFillColor(...VIOLET);
    doc.rect(MARGIN_X, yy, totalWidth, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    columns.forEach((c, i) => doc.text(pdfSafe(c.header), colX[i] + 1.5, yy + 4));
    return yy + 6;
  }

  y = ensureSpace(doc, y, 10);
  y = drawHeader(y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT);

  for (const row of rows) {
    const wrapped = columns.map((c) => doc.splitTextToSize(pdfSafe(row[c.key] ?? ""), c.width - 3) as string[]);
    const rowHeight = Math.max(...wrapped.map((lines) => lines.length)) * LINE_H + 2;

    if (y + rowHeight > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage();
      y = 20;
      y = drawHeader(y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...TEXT);
    }

    columns.forEach((c, i) => {
      doc.text(wrapped[i], colX[i] + 1.5, y + LINE_H);
    });
    doc.setDrawColor(230, 228, 240);
    doc.line(MARGIN_X, y + rowHeight, MARGIN_X + totalWidth, y + rowHeight);
    y += rowHeight;
  }

  return y + 6;
}

export interface FicheObjectifsPdfData {
  employeNom: string;
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
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...VIOLET);
  doc.text(`Fiche d'objectifs ${pdfSafe(data.annee)}`, MARGIN_X, y);
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  const identite = [
    ["Collaborateur", data.employeNom],
    ["Poste", data.poste || "—"],
    ["Département", data.departement || "—"],
    ["Responsable", data.responsableNom],
  ];
  for (const [label, value] of identite) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT);
    doc.text(`${label} :`, MARGIN_X, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(pdfSafe(value), MARGIN_X + 32, y);
    y += 5.5;
  }
  y += 3;

  y = sectionTitle(doc, "Objectifs", y);
  y = drawTable(
    doc,
    [
      { header: "N°", key: "numero", width: 8 },
      { header: "Axe", key: "axe", width: 24 },
      { header: "Objectif", key: "objectif", width: 45 },
      { header: "Livrables attendus", key: "livrables", width: 45 },
      { header: "KPI / Cible", key: "kpi", width: 40 },
      { header: "Échéance", key: "echeance", width: 16 },
    ],
    data.objectifs.map((o) => ({
      numero: String(o.numero),
      axe: o.axe,
      objectif: o.objectif,
      livrables: o.livrables,
      kpi: o.cible ? `${o.kpi} (cible : ${o.cible})` : o.kpi,
      echeance: o.echeance,
    })),
    y
  );

  y = sectionTitle(doc, "Savoir-être attendu", y);
  y = drawTable(
    doc,
    [
      { header: "Critère", key: "libelle", width: 45 },
      { header: "Comportements attendus", key: "description", width: 105 },
      { header: "Niveau attendu", key: "niveau", width: 28 },
    ],
    data.softSkills.map((s) => ({
      libelle: s.libelle,
      description: s.description,
      niveau: NIVEAU_LABEL[s.niveauAttendu] ?? s.niveauAttendu,
    })),
    y
  );

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    "Document généré par le SIRH — les pondérations et l'évaluation de ces objectifs seront communiquées lors de la campagne d'évaluation.",
    MARGIN_X,
    doc.internal.pageSize.getHeight() - 10,
    { maxWidth: 178 }
  );

  return Buffer.from(doc.output("arraybuffer"));
}
