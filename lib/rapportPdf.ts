import "server-only";
import { jsPDF } from "jspdf";
import type { RapportMensuel } from "@/lib/rapportMensuel";

function pdfSafe(text: string): string {
  return text.replace(/[    ﻿]/g, " ");
}

function sectionTitle(doc: jsPDF, text: string, x: number, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(69, 58, 120);
  doc.text(pdfSafe(text), x, y);
  doc.setDrawColor(69, 58, 120);
  doc.setLineWidth(0.3);
  doc.line(x, y + 1.5, x + 80, y + 1.5);
  return y + 8;
}

function table(doc: jsPDF, rows: [string, string | number][], x: number, y: number, width: number): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(28, 27, 46);
  for (const [label, value] of rows) {
    doc.text(pdfSafe(label), x, y);
    doc.text(pdfSafe(String(value)), x + width, y, { align: "right" });
    y += 5;
  }
  return y + 3;
}

/** Renders the "Tableau de bord RH Groupe" monthly report as a PDF —
 * plain tables rather than charts, since this is meant to be printed/
 * archived/emailed, not an interactive view (that's the /rapports/mensuel
 * page itself). */
export function renderRapportMensuelPdf(rapport: RapportMensuel): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marginX = 18;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(69, 58, 120);
  doc.text("Tableau de bord RH Groupe", marginX, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(74, 70, 96);
  doc.text(pdfSafe(rapport.label.replace(/^./, (c) => c.toUpperCase())), marginX, y);
  y += 10;

  y = sectionTitle(doc, "Effectifs", marginX, y);
  y = table(doc, [["Effectif total", rapport.effectifs.total]], marginX, y, pageWidth - marginX * 2);
  y = table(doc, rapport.effectifs.parEntite, marginX, y, pageWidth - marginX * 2);
  y += 3;
  y = table(doc, rapport.effectifs.parPole, marginX, y, pageWidth - marginX * 2);
  y += 5;

  y = sectionTitle(doc, "Recrutements", marginX, y);
  y = table(doc, [["Embauches du mois", rapport.recrutements.total]], marginX, y, pageWidth - marginX * 2);
  if (rapport.recrutements.liste.length > 0) {
    y = table(
      doc,
      rapport.recrutements.liste.map((r) => [r.fullname, r.poste]),
      marginX,
      y,
      pageWidth - marginX * 2
    );
  }
  y += 5;

  y = sectionTitle(doc, "Absentéisme", marginX, y);
  y = table(
    doc,
    [
      ["Jours d'absence (validés)", rapport.absenteisme.joursTotal],
      ["Taux d'absentéisme", rapport.absenteisme.tauxPct != null ? `${rapport.absenteisme.tauxPct}%` : "—"],
    ],
    marginX,
    y,
    pageWidth - marginX * 2
  );
  if (rapport.absenteisme.parEntite.length > 0) {
    y = table(
      doc,
      rapport.absenteisme.parEntite.map(([k, v]) => [k, `${v}j`]),
      marginX,
      y,
      pageWidth - marginX * 2
    );
  }
  y += 5;

  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  y = sectionTitle(doc, "Turnover", marginX, y);
  y = table(
    doc,
    [
      ["Départs", rapport.turnover.departs ?? "—"],
      ["Taux de turnover", rapport.turnover.tauxPct != null ? `${rapport.turnover.tauxPct}%` : "—"],
    ],
    marginX,
    y,
    pageWidth - marginX * 2
  );
  if (rapport.turnover.commentaire) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(110, 105, 133);
    doc.text(pdfSafe(rapport.turnover.commentaire), marginX, y, { maxWidth: pageWidth - marginX * 2 });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
