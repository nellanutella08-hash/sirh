import "server-only";
import ExcelJS from "exceljs";
import type { RapportMensuel } from "@/lib/rapportMensuel";
import { INDICATEURS } from "@/lib/indicateurs";

// Charte graphique Synelia v6.3 — mêmes couleurs que lib/rapportPdf.ts et
// lib/ficheObjectifsPdf.ts : en-tête de tableau violet/texte blanc, lignes
// alternées Gris Clair/blanc, titres en Violet Profond.
const VIOLET = "FF6759A2";
const VIOLET_DEEP = "FF453A78";
const VIOLET_MIST = "FFEDEAF6";
const GRAY_LIGHT = "FFF4F3F8";
const INK = "FF1C1B2E";
const GRAY_TEXT = "FF6E6985";
const WHITE = "FFFFFFFF";

const TITLE_FONT = { name: "Calibri", bold: true, size: 13, color: { argb: WHITE } };
const SUBHEADER_FONT = { name: "Calibri", bold: true, size: 10.5, color: { argb: VIOLET_DEEP } };
const TABLE_HEADER_FONT = { name: "Calibri", bold: true, size: 10, color: { argb: WHITE } };
const DATA_FONT = { name: "Calibri", size: 10, color: { argb: INK } };
const EMPTY_FONT = { name: "Calibri", italic: true, size: 9.5, color: { argb: GRAY_TEXT } };

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function titleBand(ws: ExcelJS.Worksheet, row: number, text: string, span: number) {
  ws.mergeCells(row, 1, row, span);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = TITLE_FONT;
  cell.fill = fill(VIOLET);
  cell.alignment = { vertical: "middle" };
  ws.getRow(row).height = 22;
}

function subHeader(ws: ExcelJS.Worksheet, row: number, text: string, span: number) {
  ws.mergeCells(row, 1, row, span);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = SUBHEADER_FONT;
  cell.fill = fill(VIOLET_MIST);
  cell.alignment = { vertical: "middle" };
  ws.getRow(row).height = 16;
}

function tableHeader(ws: ExcelJS.Worksheet, row: number, headers: string[]) {
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    cell.font = TABLE_HEADER_FONT;
    cell.fill = fill(VIOLET);
    cell.alignment = { vertical: "middle" };
  });
}

function dataRow(
  ws: ExcelJS.Worksheet,
  row: number,
  values: (string | number)[],
  opts?: { zebra?: boolean; numFmt?: string; bold?: boolean }
) {
  values.forEach((v, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = v;
    cell.font = opts?.bold ? { ...DATA_FONT, bold: true } : DATA_FONT;
    if (opts?.zebra) cell.fill = fill(GRAY_LIGHT);
    if (opts?.numFmt && typeof v === "number") cell.numFmt = opts.numFmt;
  });
}

function emptyNote(ws: ExcelJS.Worksheet, row: number, text: string, span: number) {
  ws.mergeCells(row, 1, row, span);
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = EMPTY_FONT;
}

/** Same report as rapportPdf, one sheet per domain — styled like a real
 * report (bandeau violet, en-têtes de tableau, lignes alternées, colonnes
 * dimensionnées, pourcentages/dates typés) rather than bare rows of text,
 * so RH can read it directly as well as pivot/chart it further in Excel. */
export async function renderRapportMensuelXlsx(rapport: RapportMensuel): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SIRH Synelia";
  wb.created = new Date();

  const label = rapport.label.replace(/^./, (c) => c.toUpperCase());

  // --- Effectifs -----------------------------------------------------
  const wsEff = wb.addWorksheet("Effectifs", { views: [{ showGridLines: false }] });
  wsEff.columns = [{ width: 36 }, { width: 14 }];
  titleBand(wsEff, 1, `Effectifs — ${label}`, 2);
  let r = 3;
  dataRow(wsEff, r, ["Effectif total", rapport.effectifs.total], { bold: true, numFmt: "#,##0" });
  r += 2;
  subHeader(wsEff, r, "Par entité", 2);
  r++;
  tableHeader(wsEff, r, ["Entité", "Effectif"]);
  r++;
  rapport.effectifs.parEntite.forEach(([k, v], i) => {
    dataRow(wsEff, r, [k, v], { zebra: i % 2 === 1, numFmt: "#,##0" });
    r++;
  });
  r++;
  subHeader(wsEff, r, "Par pôle", 2);
  r++;
  tableHeader(wsEff, r, ["Pôle", "Effectif"]);
  r++;
  rapport.effectifs.parPole.forEach(([k, v], i) => {
    dataRow(wsEff, r, [k, v], { zebra: i % 2 === 1, numFmt: "#,##0" });
    r++;
  });
  r++;
  subHeader(wsEff, r, "Par type de contrat", 2);
  r++;
  tableHeader(wsEff, r, ["Type de contrat", "Effectif"]);
  r++;
  rapport.effectifs.parContrat.forEach(([k, v], i) => {
    dataRow(wsEff, r, [k, v], { zebra: i % 2 === 1, numFmt: "#,##0" });
    r++;
  });

  // --- Recrutements ----------------------------------------------------
  const wsRec = wb.addWorksheet("Recrutements", { views: [{ showGridLines: false }] });
  wsRec.columns = [{ width: 32 }, { width: 32 }, { width: 16 }];
  titleBand(wsRec, 1, `Recrutements — ${label}`, 3);
  r = 3;
  tableHeader(wsRec, r, ["Nom", "Poste", "Date"]);
  r++;
  if (rapport.recrutements.liste.length === 0) {
    emptyNote(wsRec, r, "Aucune embauche enregistrée ce mois-ci.", 3);
  } else {
    rapport.recrutements.liste.forEach((rec, i) => {
      const cellRow = wsRec.getRow(r);
      cellRow.getCell(1).value = rec.fullname;
      cellRow.getCell(2).value = rec.poste;
      const d = rec.date ? new Date(rec.date) : null;
      cellRow.getCell(3).value = d && !Number.isNaN(d.getTime()) ? d : rec.date;
      cellRow.getCell(3).numFmt = "dd/mm/yyyy";
      [1, 2, 3].forEach((c) => {
        cellRow.getCell(c).font = DATA_FONT;
        if (i % 2 === 1) cellRow.getCell(c).fill = fill(GRAY_LIGHT);
      });
      r++;
    });
  }

  // --- Absenteisme -------------------------------------------------------
  const wsAbs = wb.addWorksheet("Absenteisme", { views: [{ showGridLines: false }] });
  wsAbs.columns = [{ width: 36 }, { width: 14 }];
  titleBand(wsAbs, 1, `Absentéisme — ${label}`, 2);
  r = 3;
  dataRow(wsAbs, r, ["Jours d'absence", rapport.absenteisme.joursTotal], { bold: true, numFmt: "#,##0" });
  r++;
  dataRow(wsAbs, r, ["Taux d'absentéisme (%)", rapport.absenteisme.tauxPct ?? 0], {
    bold: true,
    numFmt: rapport.absenteisme.tauxPct != null ? '0.0"%"' : undefined,
  });
  if (rapport.absenteisme.tauxPct == null) wsAbs.getCell(r, 2).value = "—";
  r += 2;
  subHeader(wsAbs, r, "Par entité", 2);
  r++;
  tableHeader(wsAbs, r, ["Entité", "Jours"]);
  r++;
  rapport.absenteisme.parEntite.forEach(([k, v], i) => {
    dataRow(wsAbs, r, [k, v], { zebra: i % 2 === 1, numFmt: "#,##0" });
    r++;
  });

  // --- Turnover ------------------------------------------------------
  const wsTurn = wb.addWorksheet("Turnover", { views: [{ showGridLines: false }] });
  wsTurn.columns = [{ width: 24 }, { width: 50 }];
  titleBand(wsTurn, 1, `Turnover — ${label}`, 2);
  r = 3;
  dataRow(wsTurn, r, ["Départs", rapport.turnover.departs ?? 0], { bold: true, numFmt: "#,##0" });
  if (rapport.turnover.departs == null) wsTurn.getCell(r, 2).value = "—";
  r++;
  dataRow(wsTurn, r, ["Taux (%)", rapport.turnover.tauxPct ?? 0], {
    bold: true,
    numFmt: rapport.turnover.tauxPct != null ? '0.0"%"' : undefined,
  });
  if (rapport.turnover.tauxPct == null) wsTurn.getCell(r, 2).value = "—";
  r++;
  dataRow(wsTurn, r, ["Commentaire", rapport.turnover.commentaire ?? "—"]);
  wsTurn.getCell(r, 2).alignment = { wrapText: true };

  // --- Definitions ---------------------------------------------------
  // Livrable "Définitions des indicateurs + sources de données" : pour
  // chaque chiffre publié ci-dessus, sa définition, son mode de calcul,
  // sa source et sa fréquence.
  const wsDef = wb.addWorksheet("Definitions", { views: [{ showGridLines: false }] });
  wsDef.columns = [{ width: 22 }, { width: 46 }, { width: 38 }, { width: 32 }, { width: 13 }, { width: 40 }];
  titleBand(wsDef, 1, "Définitions des indicateurs", 6);
  r = 3;
  tableHeader(wsDef, r, ["Indicateur", "Définition", "Mode de calcul", "Source", "Fréquence", "Remarque"]);
  r++;
  INDICATEURS.forEach((ind, i) => {
    dataRow(
      wsDef,
      r,
      [ind.nom, ind.definition, ind.formule, ind.source, ind.frequence, ind.remarque ?? ""],
      { zebra: i % 2 === 1 }
    );
    wsDef.getRow(r).alignment = { wrapText: true, vertical: "top" };
    wsDef.getRow(r).height = 60;
    r++;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
