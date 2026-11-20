import "server-only";
import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";
import type { RapportMensuel } from "@/lib/rapportMensuel";
import { INDICATEURS } from "@/lib/indicateurs";

// Same NBSP/narrow-no-break-space bug as lib/ficheObjectifsPdf.ts: French
// text (and Intl.NumberFormat's thousands separator) can carry U+00A0/U+202F
// which breaks jsPDF's WinAnsi encoding and renders as garbled stretched
// text — strip it before anything reaches doc.text().
function pdfSafe(text: string): string {
  return (text ?? "")
    .replace(/[    ﻿]/g, " ")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=");
}

function fmtInt(n: number): string {
  return pdfSafe(new Intl.NumberFormat("fr-FR").format(n));
}

const MARGIN_X = 16;
const CONTENT_WIDTH = 178; // A4 width (210mm) minus both margins
// Charte graphique Synelia v6.3 : Violet Synelia #6759A2, Violet Profond
// #453A78, Violet Brume #EDEAF6, Gris Clair #F4F3F8, Encre #1C1B2E, Gris
// Texte #6E6985, Succès #0E7A50, Alerte #8F5500, Erreur #C42B30.
const HEADER_VIOLET: [number, number, number] = [103, 89, 162];
const TITLE_VIOLET: [number, number, number] = [69, 58, 120];
const IDENT_BG: [number, number, number] = [237, 234, 246];
const ZEBRA_BG: [number, number, number] = [244, 243, 248];
const TEXT: [number, number, number] = [28, 27, 46];
const MUTED: [number, number, number] = [110, 105, 133];
const SUCCESS: [number, number, number] = [14, 122, 80];
const WARN: [number, number, number] = [143, 85, 0];
const ERROR: [number, number, number] = [196, 43, 48];
const LINE_H = 4.6;
const FOOTER_Y_OFFSET = 12;
const PAGE_BOTTOM_LIMIT = 22;

const LOGO_SRC = "/logos/synelia.png";

function loadLogoDataUri(): string | null {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", LOGO_SRC.replace(/^\//, "")));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function drawLogo(doc: jsPDF, logoDataUri: string | null) {
  if (!logoDataUri) return;
  try {
    doc.addImage(logoDataUri, "PNG", MARGIN_X, 10, 28, 9.5);
  } catch {
    // best-effort — a corrupt/missing logo shouldn't break the PDF
  }
}

function drawFooter(doc: jsPDF, label: string, pageNum: number, totalPages: number) {
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
  doc.text(
    pdfSafe(`Rapport RH — ${label} · Page ${pageNum}/${totalPages}`),
    MARGIN_X + CONTENT_WIDTH,
    y,
    { align: "right" }
  );
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
  doc.setDrawColor(...HEADER_VIOLET);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, y + 1.5, MARGIN_X + CONTENT_WIDTH, y + 1.5);
  return y + 9;
}

function emptyNote(doc: jsPDF, text: string, y: number): number {
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(pdfSafe(text), MARGIN_X, y);
  return y + 7;
}

interface Column {
  header: string;
  key: string;
  width: number;
  align?: "left" | "right";
  emphasize?: boolean;
}

/** Draws a wrapping, paginating, zebra-striped table — jsPDF has no grid
 * primitive of its own, so each cell's text is wrapped to its column width
 * and every row's height follows its tallest cell. */
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
    columns.forEach((c, i) => {
      if (c.align === "right") {
        doc.text(pdfSafe(c.header), colX[i] + c.width - 2, yy + 4.4, { align: "right" });
      } else {
        doc.text(pdfSafe(c.header), colX[i] + 2, yy + 4.4);
      }
    });
    return yy + 6.5;
  }

  y = ensureSpace(doc, y, 12, logoDataUri);
  y = drawHeader(y);

  rows.forEach((row, rowIndex) => {
    const wrapped = columns.map((c) => doc.splitTextToSize(pdfSafe(row[c.key] ?? ""), c.width - 4) as string[]);
    const rowHeight = Math.max(1, ...wrapped.map((lines) => lines.length)) * LINE_H + 3;

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
      if (c.align === "right") {
        doc.text(wrapped[i], colX[i] + c.width - 2, y + LINE_H, { align: "right" });
      } else {
        doc.text(wrapped[i], colX[i] + 2, y + LINE_H);
      }
    });
    y += rowHeight;
  });

  return y + 6;
}

interface KpiCard {
  label: string;
  value: string;
  color: [number, number, number];
  sub?: string;
}

/** Four stat tiles across the content width, mirroring the KpiCard
 * component the live /rapports/mensuel page itself uses — so the PDF export
 * reads like a snapshot of that page rather than a bare data dump. */
function drawKpiCards(doc: jsPDF, y: number, cards: KpiCard[]): number {
  const gap = 4;
  const cardHeight = 24;
  const width = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;

  cards.forEach((card, i) => {
    const x = MARGIN_X + i * (width + gap);
    doc.setFillColor(...IDENT_BG);
    doc.roundedRect(x, y, width, cardHeight, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(pdfSafe(card.label.toUpperCase()), width - 8), x + 4, y + 6.5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(...card.color);
    doc.text(pdfSafe(card.value), x + 4, y + 16.5);

    if (card.sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(pdfSafe(card.sub), x + 4, y + 21.3, { maxWidth: width - 8 });
    }
  });

  return y + cardHeight + 9;
}

const ENTITE_COLUMNS = (header: string): Column[] => [
  { header, key: "label", width: CONTENT_WIDTH - 34 },
  { header: "Effectif", key: "value", width: 34, align: "right", emphasize: true },
];

/** Renders the "Tableau de bord RH Groupe" monthly report as a PDF —
 * branded like the rest of the SIRH's PDF exports (logo, violet charte
 * graphique, zebra-striped tables, page footer) rather than as plain
 * unstyled tables, since this is what gets printed/archived/emailed. */
export function renderRapportMensuelPdf(rapport: RapportMensuel): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logoDataUri = loadLogoDataUri();
  let y = 20;

  drawLogo(doc, logoDataUri);
  y = 34;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...TITLE_VIOLET);
  doc.text("Tableau de bord RH Groupe", MARGIN_X + CONTENT_WIDTH / 2, y, { align: "center" });
  y += 6;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(10.5);
  doc.setTextColor(...MUTED);
  doc.text(
    pdfSafe(rapport.label.replace(/^./, (c) => c.toUpperCase())),
    MARGIN_X + CONTENT_WIDTH / 2,
    y,
    { align: "center" }
  );
  y += 10;

  y = drawKpiCards(doc, y, [
    { label: "Effectif total", value: fmtInt(rapport.effectifs.total), color: HEADER_VIOLET },
    { label: "Recrutements du mois", value: fmtInt(rapport.recrutements.total), color: SUCCESS },
    {
      label: "Jours d'absence",
      value: fmtInt(rapport.absenteisme.joursTotal),
      color: WARN,
      sub: rapport.absenteisme.tauxPct != null ? `Taux : ${rapport.absenteisme.tauxPct}%` : undefined,
    },
    {
      label: "Turnover",
      value: rapport.turnover.departs != null ? fmtInt(rapport.turnover.departs) : "—",
      color: ERROR,
      sub: rapport.turnover.tauxPct != null ? `Taux : ${rapport.turnover.tauxPct}%` : undefined,
    },
  ]);

  y = sectionTitle(doc, "Effectifs par entité", y);
  y = drawTable(
    doc,
    ENTITE_COLUMNS("Entité"),
    rapport.effectifs.parEntite.map(([label, value]) => ({ label, value: fmtInt(value) })),
    y,
    logoDataUri
  );

  y = ensureSpace(doc, y, 24, logoDataUri);
  y = sectionTitle(doc, "Répartition par pôle", y);
  y = drawTable(
    doc,
    ENTITE_COLUMNS("Pôle"),
    rapport.effectifs.parPole.map(([label, value]) => ({ label, value: fmtInt(value) })),
    y,
    logoDataUri
  );

  y = ensureSpace(doc, y, 24, logoDataUri);
  y = sectionTitle(doc, "Répartition par type de contrat", y);
  y = drawTable(
    doc,
    ENTITE_COLUMNS("Type de contrat"),
    rapport.effectifs.parContrat.map(([label, value]) => ({ label, value: fmtInt(value) })),
    y,
    logoDataUri
  );

  y = ensureSpace(doc, y, 24, logoDataUri);
  y = sectionTitle(doc, `Recrutements — ${rapport.label}`, y);
  if (rapport.recrutements.liste.length === 0) {
    y = emptyNote(doc, "Aucune embauche enregistrée ce mois-ci.", y);
  } else {
    y = drawTable(
      doc,
      [
        { header: "Collaborateur", key: "fullname", width: 90 },
        { header: "Poste", key: "poste", width: 58 },
        { header: "Date", key: "date", width: 30, align: "right", emphasize: true },
      ],
      rapport.recrutements.liste.map((r) => ({
        fullname: r.fullname,
        poste: r.poste,
        date: r.date ? r.date.slice(0, 10).split("-").reverse().join("/") : "—",
      })),
      y,
      logoDataUri
    );
  }

  y = ensureSpace(doc, y, 24, logoDataUri);
  y = sectionTitle(doc, "Absentéisme", y);
  y = drawTable(
    doc,
    [
      { header: "Indicateur", key: "label", width: CONTENT_WIDTH - 34 },
      { header: "Valeur", key: "value", width: 34, align: "right", emphasize: true },
    ],
    [
      { label: "Jours d'absence (validés)", value: fmtInt(rapport.absenteisme.joursTotal) },
      {
        label: "Taux d'absentéisme",
        value: rapport.absenteisme.tauxPct != null ? `${rapport.absenteisme.tauxPct}%` : "—",
      },
    ],
    y,
    logoDataUri
  );
  if (rapport.absenteisme.parEntite.length > 0) {
    y = drawTable(
      doc,
      ENTITE_COLUMNS("Entité").map((c) => (c.key === "value" ? { ...c, header: "Jours" } : c)),
      rapport.absenteisme.parEntite.map(([label, value]) => ({ label, value: `${fmtInt(value)} j` })),
      y,
      logoDataUri
    );
  }

  y = ensureSpace(doc, y, 30, logoDataUri);
  y = sectionTitle(doc, "Turnover", y);
  y = drawTable(
    doc,
    [
      { header: "Indicateur", key: "label", width: CONTENT_WIDTH - 34 },
      { header: "Valeur", key: "value", width: 34, align: "right", emphasize: true },
    ],
    [
      { label: "Départs", value: rapport.turnover.departs != null ? fmtInt(rapport.turnover.departs) : "—" },
      {
        label: "Taux de turnover",
        value: rapport.turnover.tauxPct != null ? `${rapport.turnover.tauxPct}%` : "—",
      },
    ],
    y,
    logoDataUri
  );
  if (rapport.turnover.commentaire) {
    y = ensureSpace(doc, y, 10, logoDataUri);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(pdfSafe(rapport.turnover.commentaire), MARGIN_X, y, { maxWidth: CONTENT_WIDTH });
  }

  // Annexe : définitions des indicateurs, sur une nouvelle page pour que le
  // rapport imprimé reste lisible et que chaque taux publié puisse être
  // justifié (livrable "Définitions des indicateurs + sources de données").
  doc.addPage();
  drawLogo(doc, logoDataUri);
  y = 34;
  y = sectionTitle(doc, "Définitions des indicateurs", y);
  for (const ind of INDICATEURS) {
    const lines: [string, "normal" | "italic", boolean][] = [
      [ind.definition, "normal", false],
      [`Calcul : ${ind.formule}`, "normal", false],
      [`Source : ${ind.source} — Fréquence : ${ind.frequence}`, "normal", false],
      ...(ind.remarque ? ([[ind.remarque, "italic", true]] as [string, "normal" | "italic", boolean][]) : []),
    ];
    doc.setFontSize(9);
    const wrapped = lines.map(([t, style, muted]) => ({
      split: doc.splitTextToSize(pdfSafe(t), CONTENT_WIDTH) as string[],
      style,
      muted,
    }));
    const blockHeight = 5.5 + wrapped.reduce((h, w) => h + w.split.length * 4.2, 0) + 4;
    y = ensureSpace(doc, y, blockHeight, logoDataUri);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TITLE_VIOLET);
    doc.text(pdfSafe(ind.nom), MARGIN_X, y);
    y += 5.5;
    for (const w of wrapped) {
      doc.setFont("helvetica", w.style);
      doc.setFontSize(9);
      doc.setTextColor(...(w.muted ? MUTED : TEXT));
      doc.text(w.split, MARGIN_X, y);
      y += w.split.length * 4.2;
    }
    y += 4;
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(doc, rapport.label, i, totalPages);
  }

  return Buffer.from(doc.output("arraybuffer"));
}
