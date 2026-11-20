import "server-only";
import pptxgen from "pptxgenjs";
import fs from "fs";
import path from "path";
import type { RapportMensuel } from "@/lib/rapportMensuel";
import { INDICATEURS } from "@/lib/indicateurs";

// Charte graphique Synelia v6.3. Présentations : format 16:9, logo en haut,
// Cambria pour les titres / Calibri pour le corps (les deux sont livrées
// avec Office, donc fidèles sans intégration de police). Palette de data
// visualisation (3.9) : ordre de rang imposé pour les graphiques à
// plusieurs catégories, jusqu'à 6 séries puis repli sur "Autres" — jamais
// les couleurs de statut (succès/alerte/erreur) comme couleur de série.
const VIOLET = "6759A2";
const VIOLET_DEEP = "453A78";
const VIOLET_NUIT = "2E2751";
const VIOLET_MIST = "EDEAF6";
const GRAY_LIGHT = "F4F3F8";
const INK = "1C1B2E";
const GRAY_TEXT = "6E6985";
const SUCCESS = "0E7A50";
const WARN = "8F5500";
const ERROR = "C42B30";
const WHITE = "FFFFFF";

const CHART_SERIES = ["6759A2", "1668A8", "0B7D7B", "C24A2E", "A99FD0", "8A6D24"];
const CHART_OTHER = "9992B0"; // neutre, réservé à la catégorie "Autres" au-delà du rang 6

const LOGO_PATH = path.join(process.cwd(), "public", "logos", "synelia.png");
const HAS_LOGO = fs.existsSync(LOGO_PATH);

const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
const MARGIN = 0.4;
const CONTENT_W = SLIDE_W - MARGIN * 2;

function fmtInt(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}

/** Keeps the top `n` rows by value and folds everything past that into a
 * single "Autres" row — both for chart legibility (3.9: "au-delà de six
 * séries, le graphique est illisible") and so a long tail of small entités
 * doesn't crowd out the categories that actually matter. */
function capRows(rows: [string, number][], n: number): [string, number][] {
  if (rows.length <= n) return rows;
  const head = rows.slice(0, n - 1);
  const restTotal = rows.slice(n - 1).reduce((s, [, v]) => s + v, 0);
  return [...head, ["Autres", restTotal]];
}

function addBrandedSlide(pptx: pptxgen, title: string): pptxgen.Slide {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.62,
    fill: { color: VIOLET },
    line: { type: "none" },
  });
  slide.addText(title, {
    x: MARGIN,
    y: 0,
    w: HAS_LOGO ? CONTENT_W - 1.6 : CONTENT_W,
    h: 0.62,
    fontFace: "Cambria",
    fontSize: 20,
    bold: true,
    color: WHITE,
    valign: "middle",
  });
  if (HAS_LOGO) {
    slide.addImage({ path: LOGO_PATH, x: SLIDE_W - MARGIN - 1.3, y: 0.11, w: 1.3, h: 0.42 });
  }
  slide.addText("SYNELIA GROUP · CAPITAL HUMAIN", {
    x: MARGIN,
    y: SLIDE_H - 0.34,
    w: CONTENT_W,
    h: 0.24,
    fontFace: "Calibri",
    fontSize: 8,
    color: GRAY_TEXT,
  });
  return slide;
}

function addKpiTile(
  slide: pptxgen.Slide,
  pptx: pptxgen,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  color: string,
  sub?: string
) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.06,
    fill: { color: VIOLET_MIST },
    line: { type: "none" },
  });
  slide.addText(label.toUpperCase(), {
    x: x + 0.18,
    y: y + 0.12,
    w: w - 0.36,
    h: 0.3,
    fontFace: "Calibri",
    fontSize: 10,
    bold: true,
    color: GRAY_TEXT,
  });
  slide.addText(value, {
    x: x + 0.18,
    y: y + 0.4,
    w: w - 0.36,
    h: 0.55,
    fontFace: "Cambria",
    fontSize: 26,
    bold: true,
    color,
  });
  if (sub) {
    slide.addText(sub, {
      x: x + 0.18,
      y: y + 0.95,
      w: w - 0.36,
      h: 0.3,
      fontFace: "Calibri",
      fontSize: 9,
      color: GRAY_TEXT,
    });
  }
}

function addKpiRow(
  slide: pptxgen.Slide,
  pptx: pptxgen,
  y: number,
  cards: { label: string; value: string; color: string; sub?: string }[]
) {
  const gap = 0.3;
  const w = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
  cards.forEach((c, i) => {
    addKpiTile(slide, pptx, MARGIN + i * (w + gap), y, w, 1.4, c.label, c.value, c.color, c.sub);
  });
}

interface TableColumn {
  header: string;
  key: string;
  width: number;
}

function addBrandedTable(
  slide: pptxgen.Slide,
  columns: TableColumn[],
  rows: Record<string, string>[],
  x: number,
  y: number
) {
  const headerRow: pptxgen.TableRow = columns.map((c) => ({
    text: c.header,
    options: { bold: true, color: WHITE, fill: { color: VIOLET }, fontFace: "Calibri", fontSize: 11 },
  }));
  const bodyRows: pptxgen.TableRow[] = rows.map((row, i) =>
    columns.map((c) => ({
      text: row[c.key] ?? "",
      options: {
        color: INK,
        fontFace: "Calibri",
        fontSize: 10.5,
        fill: { color: i % 2 === 1 ? GRAY_LIGHT : WHITE },
      },
    }))
  );
  slide.addTable([headerRow, ...bodyRows], {
    x,
    y,
    w: columns.reduce((s, c) => s + c.width, 0),
    colW: columns.map((c) => c.width),
    border: { type: "solid", color: "E3E0EE", pt: 0.5 },
    autoPage: true,
    autoPageRepeatHeader: true,
  });
}

function addEmptyNote(slide: pptxgen.Slide, text: string, y: number) {
  slide.addText(text, {
    x: MARGIN,
    y,
    w: CONTENT_W,
    h: 0.4,
    fontFace: "Calibri",
    fontSize: 11,
    italic: true,
    color: GRAY_TEXT,
  });
}

function addCoverSlide(pptx: pptxgen, rapport: RapportMensuel) {
  const slide = pptx.addSlide();
  slide.background = { color: VIOLET_NUIT };
  if (HAS_LOGO) {
    slide.addImage({ path: LOGO_PATH, x: SLIDE_W / 2 - 1.1, y: 1.9, w: 2.2, h: 0.75 });
  }
  slide.addText("Tableau de bord RH Groupe", {
    x: 0,
    y: 3.15,
    w: SLIDE_W,
    h: 0.9,
    align: "center",
    fontFace: "Cambria",
    fontSize: 34,
    bold: true,
    color: WHITE,
  });
  slide.addText(rapport.label.replace(/^./, (c) => c.toUpperCase()), {
    x: 0,
    y: 4.0,
    w: SLIDE_W,
    h: 0.5,
    align: "center",
    fontFace: "Calibri",
    fontSize: 17,
    color: "D8D2EC",
  });
  slide.addText("Document généré depuis le SIRH — Groupe Synelia", {
    x: 0,
    y: SLIDE_H - 0.8,
    w: SLIDE_W,
    h: 0.4,
    align: "center",
    fontFace: "Calibri",
    fontSize: 10,
    italic: true,
    color: "B9AFDC",
  });
}

function addKpiSlide(pptx: pptxgen, rapport: RapportMensuel) {
  const slide = addBrandedSlide(pptx, "Vue d'ensemble");
  addKpiRow(slide, pptx, 1.1, [
    { label: "Effectif total", value: fmtInt(rapport.effectifs.total), color: VIOLET },
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
}

/** Une seule série (l'effectif) sur de nombreuses catégories (entités) :
 * par la règle 3.9, une série = violet, jamais une autre couleur par
 * barre — la distinction entre catégories vient des étiquettes d'axe, pas
 * de la couleur. */
function addEffectifsSlide(pptx: pptxgen, rapport: RapportMensuel) {
  const slide = addBrandedSlide(pptx, "Effectifs par entité");
  const rows = capRows(rapport.effectifs.parEntite, 10).slice().reverse();
  slide.addChart(
    pptx.ChartType.bar,
    [{ name: "Effectif", labels: rows.map(([l]) => l), values: rows.map(([, v]) => v) }],
    {
      x: MARGIN,
      y: 0.95,
      w: CONTENT_W,
      h: SLIDE_H - 1.3,
      barDir: "bar",
      chartColors: [VIOLET],
      showLegend: false,
      showValue: true,
      dataLabelColor: INK,
      dataLabelFontFace: "Calibri",
      dataLabelFontSize: 10,
      dataLabelPosition: "outEnd",
      catAxisLabelFontFace: "Calibri",
      catAxisLabelFontSize: 10,
      catAxisLabelColor: INK,
      valAxisHidden: true,
      valGridLine: { style: "none" },
      serAxisHidden: true,
    }
  );
}

/** Pôle et type de contrat sont de vraies répartitions multi-catégories :
 * palette catégorielle à rang imposé (3.9), plafonnée à 6 teintes + "Autres"
 * en gris neutre au-delà. */
function addRepartitionSlide(pptx: pptxgen, rapport: RapportMensuel) {
  const slide = addBrandedSlide(pptx, "Répartition — pôles & types de contrat");

  const half = (CONTENT_W - 0.3) / 2;

  slide.addText("Par pôle", {
    x: MARGIN,
    y: 0.85,
    w: half,
    h: 0.3,
    fontFace: "Cambria",
    fontSize: 13,
    bold: true,
    color: VIOLET_DEEP,
  });
  const parPole = capRows(rapport.effectifs.parPole, 6);
  slide.addChart(
    pptx.ChartType.doughnut,
    [{ name: "Effectif", labels: parPole.map(([l]) => l), values: parPole.map(([, v]) => v) }],
    {
      x: MARGIN,
      y: 1.2,
      w: half,
      h: SLIDE_H - 1.6,
      chartColors: parPole.map((_, i) => (i < CHART_SERIES.length ? CHART_SERIES[i] : CHART_OTHER)),
      showLegend: true,
      legendPos: "b",
      legendColor: INK,
      legendFontFace: "Calibri",
      legendFontSize: 9,
      showPercent: true,
      dataLabelColor: WHITE,
      dataLabelFontFace: "Calibri",
      dataLabelFontSize: 10,
      dataLabelFormatCode: "0%",
    }
  );

  slide.addText("Par type de contrat", {
    x: MARGIN + half + 0.3,
    y: 0.85,
    w: half,
    h: 0.3,
    fontFace: "Cambria",
    fontSize: 13,
    bold: true,
    color: VIOLET_DEEP,
  });
  const parContrat = capRows(rapport.effectifs.parContrat, 6);
  slide.addChart(
    pptx.ChartType.doughnut,
    [{ name: "Effectif", labels: parContrat.map(([l]) => l), values: parContrat.map(([, v]) => v) }],
    {
      x: MARGIN + half + 0.3,
      y: 1.2,
      w: half,
      h: SLIDE_H - 1.6,
      chartColors: parContrat.map((_, i) => (i < CHART_SERIES.length ? CHART_SERIES[i] : CHART_OTHER)),
      showLegend: true,
      legendPos: "b",
      legendColor: INK,
      legendFontFace: "Calibri",
      legendFontSize: 9,
      showPercent: true,
      dataLabelColor: WHITE,
      dataLabelFontFace: "Calibri",
      dataLabelFontSize: 10,
      dataLabelFormatCode: "0%",
    }
  );
}

function addRecrutementsSlide(pptx: pptxgen, rapport: RapportMensuel) {
  const slide = addBrandedSlide(pptx, `Recrutements — ${rapport.label}`);
  if (rapport.recrutements.liste.length === 0) {
    addEmptyNote(slide, "Aucune embauche enregistrée ce mois-ci.", 1.1);
    return;
  }
  addBrandedTable(
    slide,
    [
      { header: "Collaborateur", key: "fullname", width: 5.5 },
      { header: "Poste", key: "poste", width: 4.5 },
      { header: "Date", key: "date", width: 2.3 },
    ],
    rapport.recrutements.liste.map((r) => ({
      fullname: r.fullname,
      poste: r.poste,
      date: r.date ? r.date.slice(0, 10).split("-").reverse().join("/") : "—",
    })),
    MARGIN,
    0.95
  );
}

function addAbsenteismeSlide(pptx: pptxgen, rapport: RapportMensuel) {
  const slide = addBrandedSlide(pptx, "Absentéisme");
  addKpiRow(slide, pptx, 0.9, [
    { label: "Jours d'absence", value: fmtInt(rapport.absenteisme.joursTotal), color: WARN },
    {
      label: "Taux d'absentéisme",
      value: rapport.absenteisme.tauxPct != null ? `${rapport.absenteisme.tauxPct}%` : "—",
      color: WARN,
    },
  ]);
  if (rapport.absenteisme.parEntite.length > 0) {
    slide.addText("Jours d'absence par entité", {
      x: MARGIN,
      y: 2.55,
      w: CONTENT_W,
      h: 0.3,
      fontFace: "Cambria",
      fontSize: 13,
      bold: true,
      color: VIOLET_DEEP,
    });
    addBrandedTable(
      slide,
      [
        { header: "Entité", key: "label", width: 8 },
        { header: "Jours", key: "value", width: 2 },
      ],
      rapport.absenteisme.parEntite.map(([label, value]) => ({ label, value: `${fmtInt(value)} j` })),
      MARGIN,
      2.9
    );
  }
}

function addTurnoverSlide(pptx: pptxgen, rapport: RapportMensuel) {
  const slide = addBrandedSlide(pptx, "Turnover");
  addKpiRow(slide, pptx, 0.9, [
    {
      label: "Départs",
      value: rapport.turnover.departs != null ? fmtInt(rapport.turnover.departs) : "—",
      color: ERROR,
    },
    {
      label: "Taux de turnover",
      value: rapport.turnover.tauxPct != null ? `${rapport.turnover.tauxPct}%` : "—",
      color: ERROR,
    },
  ]);
  if (rapport.turnover.commentaire) {
    slide.addText("Commentaire", {
      x: MARGIN,
      y: 2.55,
      w: CONTENT_W,
      h: 0.3,
      fontFace: "Cambria",
      fontSize: 13,
      bold: true,
      color: VIOLET_DEEP,
    });
    slide.addText(rapport.turnover.commentaire, {
      x: MARGIN,
      y: 2.9,
      w: CONTENT_W,
      h: 2,
      fontFace: "Calibri",
      fontSize: 12,
      color: INK,
      valign: "top",
    });
  }
}

/** Livrable "Définitions des indicateurs + sources de données" : la même
 * annexe que lib/rapportPdf.ts et l'onglet "Definitions" de lib/rapportXlsx.ts,
 * pour que chaque taux présenté dans le deck puisse être justifié. */
function addDefinitionsSlide(pptx: pptxgen) {
  const slide = addBrandedSlide(pptx, "Définitions des indicateurs");
  addBrandedTable(
    slide,
    [
      { header: "Indicateur", key: "nom", width: 1.8 },
      { header: "Définition", key: "definition", width: 4.4 },
      { header: "Mode de calcul", key: "formule", width: 3.0 },
      { header: "Source", key: "source", width: 2.23 },
      { header: "Fréquence", key: "frequence", width: 1.2 },
    ],
    INDICATEURS.map((ind) => ({
      nom: ind.nom,
      definition: ind.remarque ? `${ind.definition}\n${ind.remarque}` : ind.definition,
      formule: ind.formule,
      source: ind.source,
      frequence: ind.frequence,
    })),
    MARGIN,
    0.95
  );
}

/** Renders the "Tableau de bord RH Groupe" monthly report as a branded
 * PowerPoint deck — a cover slide, then one slide per domain (effectifs,
 * répartitions, recrutements, absentéisme, turnover, définitions), with
 * native, still-editable charts and tables rather than a static screenshot. */
export async function renderRapportMensuelPptx(rapport: RapportMensuel): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "SYNELIA_WIDE", width: SLIDE_W, height: SLIDE_H });
  pptx.layout = "SYNELIA_WIDE";
  pptx.author = "SIRH Synelia";
  pptx.title = `Rapport RH Groupe — ${rapport.label}`;

  addCoverSlide(pptx, rapport);
  addKpiSlide(pptx, rapport);
  addEffectifsSlide(pptx, rapport);
  addRepartitionSlide(pptx, rapport);
  addRecrutementsSlide(pptx, rapport);
  addAbsenteismeSlide(pptx, rapport);
  addTurnoverSlide(pptx, rapport);
  addDefinitionsSlide(pptx);

  const buf = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(buf as Buffer);
}
