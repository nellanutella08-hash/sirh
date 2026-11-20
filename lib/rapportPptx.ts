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

/** A single compact line mixing muted labels and bold values in one run of
 * text, for an indicator that's really just one or two numbers — the pptx
 * equivalent of lib/rapportPdf.ts's drawStatLine, used to keep the combined
 * "Recrutements / Absentéisme / Turnover" slide short. */
function addStatLine(slide: pptxgen.Slide, y: number, items: { label: string; value: string }[]) {
  const runs: pptxgen.TextProps[] = [];
  items.forEach((item, i) => {
    if (i > 0) runs.push({ text: "      ", options: { fontFace: "Calibri", fontSize: 13 } });
    runs.push({ text: `${item.label} : `, options: { fontFace: "Calibri", fontSize: 13, color: GRAY_TEXT } });
    runs.push({ text: item.value, options: { fontFace: "Calibri", fontSize: 13, bold: true, color: INK } });
  });
  slide.addText(runs, { x: MARGIN, y, w: CONTENT_W, h: 0.4 });
}

function addSubLabel(slide: pptxgen.Slide, text: string, x: number, y: number, w: number) {
  slide.addText(text, {
    x,
    y,
    w,
    h: 0.3,
    fontFace: "Cambria",
    fontSize: 13,
    bold: true,
    color: VIOLET_DEEP,
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

/** Page de couverture et vue d'ensemble réunies sur une seule diapo — pour
 * un rapport mensuel qui tient en 4 pages, une couverture à elle seule est
 * un luxe qu'on ne peut pas se permettre. */
function addCoverSlide(pptx: pptxgen, rapport: RapportMensuel) {
  const slide = pptx.addSlide();
  slide.background = { color: VIOLET_NUIT };
  if (HAS_LOGO) {
    slide.addImage({ path: LOGO_PATH, x: SLIDE_W / 2 - 0.9, y: 0.5, w: 1.8, h: 0.6 });
  }
  slide.addText("Tableau de bord RH Groupe", {
    x: 0,
    y: 1.3,
    w: SLIDE_W,
    h: 0.7,
    align: "center",
    fontFace: "Cambria",
    fontSize: 28,
    bold: true,
    color: WHITE,
  });
  slide.addText(rapport.label.replace(/^./, (c) => c.toUpperCase()), {
    x: 0,
    y: 1.95,
    w: SLIDE_W,
    h: 0.4,
    align: "center",
    fontFace: "Calibri",
    fontSize: 14,
    color: "D8D2EC",
  });

  addKpiRow(slide, pptx, 2.75, [
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

  slide.addText("Document généré depuis le SIRH — Groupe Synelia", {
    x: 0,
    y: SLIDE_H - 0.55,
    w: SLIDE_W,
    h: 0.3,
    align: "center",
    fontFace: "Calibri",
    fontSize: 9,
    italic: true,
    color: "B9AFDC",
  });
}

/** Effectifs par entité (barres) et répartitions par pôle / type de contrat
 * (anneaux) réunis sur une seule diapo. Une seule série (l'effectif) sur de
 * nombreuses catégories pour les barres : par la règle 3.9, une série =
 * violet, jamais une autre couleur par barre. Les deux anneaux sont de
 * vraies répartitions multi-catégories : palette catégorielle à rang
 * imposé, plafonnée à 6 teintes + "Autres" au-delà. */
function addEffectifsSlide(pptx: pptxgen, rapport: RapportMensuel) {
  const slide = addBrandedSlide(pptx, "Effectifs & répartitions");

  const leftW = CONTENT_W * 0.56;
  const rightX = MARGIN + leftW + 0.3;
  const rightW = CONTENT_W - leftW - 0.3;

  addSubLabel(slide, "Par entité", MARGIN, 0.85, leftW);
  const rows = capRows(rapport.effectifs.parEntite, 8).slice().reverse();
  slide.addChart(
    pptx.ChartType.bar,
    [{ name: "Effectif", labels: rows.map(([l]) => l), values: rows.map(([, v]) => v) }],
    {
      x: MARGIN,
      y: 1.15,
      w: leftW,
      h: SLIDE_H - 1.5,
      barDir: "bar",
      chartColors: [VIOLET],
      showLegend: false,
      showValue: true,
      dataLabelColor: INK,
      dataLabelFontFace: "Calibri",
      dataLabelFontSize: 9,
      dataLabelPosition: "outEnd",
      catAxisLabelFontFace: "Calibri",
      catAxisLabelFontSize: 9,
      catAxisLabelColor: INK,
      valAxisHidden: true,
      valGridLine: { style: "none" },
      serAxisHidden: true,
    }
  );

  const donutH = (SLIDE_H - 1.5 - 0.5) / 2;
  const donutOpts = (rows2: [string, number][]) => ({
    chartColors: rows2.map((_, i) => (i < CHART_SERIES.length ? CHART_SERIES[i] : CHART_OTHER)),
    showLegend: true,
    legendPos: "r" as const,
    legendColor: INK,
    legendFontFace: "Calibri",
    legendFontSize: 8,
    showPercent: true,
    dataLabelColor: WHITE,
    dataLabelFontFace: "Calibri",
    dataLabelFontSize: 8,
    dataLabelFormatCode: "0%",
  });

  addSubLabel(slide, "Par pôle", rightX, 0.85, rightW);
  const parPole = capRows(rapport.effectifs.parPole, 6);
  slide.addChart(
    pptx.ChartType.doughnut,
    [{ name: "Effectif", labels: parPole.map(([l]) => l), values: parPole.map(([, v]) => v) }],
    { x: rightX, y: 1.15, w: rightW, h: donutH, ...donutOpts(parPole) }
  );

  addSubLabel(slide, "Par type de contrat", rightX, 1.15 + donutH + 0.2, rightW);
  const parContrat = capRows(rapport.effectifs.parContrat, 6);
  slide.addChart(
    pptx.ChartType.doughnut,
    [{ name: "Effectif", labels: parContrat.map(([l]) => l), values: parContrat.map(([, v]) => v) }],
    { x: rightX, y: 1.15 + donutH + 0.5, w: rightW, h: donutH, ...donutOpts(parContrat) }
  );
}

/** Recrutements, absentéisme et turnover réunis sur une seule diapo —
 * chacun tient en quelques chiffres et n'a pas besoin de sa propre page. */
function addRecrutementsAbsenteismeTurnoverSlide(pptx: pptxgen, rapport: RapportMensuel) {
  const slide = addBrandedSlide(pptx, "Recrutements, absentéisme & turnover");

  addSubLabel(slide, `Recrutements — ${rapport.label}`, MARGIN, 0.85, CONTENT_W);
  if (rapport.recrutements.liste.length === 0) {
    addEmptyNote(slide, "Aucune embauche enregistrée ce mois-ci.", 1.25);
  } else {
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
      1.2
    );
  }

  const midY = 3.35;
  addSubLabel(slide, "Absentéisme", MARGIN, midY, CONTENT_W);
  addStatLine(slide, midY + 0.4, [
    { label: "Jours d'absence", value: fmtInt(rapport.absenteisme.joursTotal) },
    {
      label: "Taux d'absentéisme",
      value: rapport.absenteisme.tauxPct != null ? `${rapport.absenteisme.tauxPct}%` : "—",
    },
  ]);

  const turnY = 4.55;
  addSubLabel(slide, "Turnover", MARGIN, turnY, CONTENT_W);
  addStatLine(slide, turnY + 0.4, [
    { label: "Départs", value: rapport.turnover.departs != null ? fmtInt(rapport.turnover.departs) : "—" },
    {
      label: "Taux de turnover",
      value: rapport.turnover.tauxPct != null ? `${rapport.turnover.tauxPct}%` : "—",
    },
  ]);
  if (rapport.turnover.commentaire) {
    slide.addText(rapport.turnover.commentaire, {
      x: MARGIN,
      y: turnY + 0.8,
      w: CONTENT_W,
      h: 1,
      fontFace: "Calibri",
      fontSize: 11,
      italic: true,
      color: GRAY_TEXT,
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

/** Renders the "Tableau de bord RH Groupe" monthly report as a branded,
 * deliberately short PowerPoint deck — 4 slides (couverture + vue
 * d'ensemble, effectifs & répartitions, recrutements/absentéisme/turnover,
 * définitions), with native, still-editable charts and tables rather than
 * a static screenshot. */
export async function renderRapportMensuelPptx(rapport: RapportMensuel): Promise<Buffer> {
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "SYNELIA_WIDE", width: SLIDE_W, height: SLIDE_H });
  pptx.layout = "SYNELIA_WIDE";
  pptx.author = "SIRH Synelia";
  pptx.title = `Rapport RH Groupe — ${rapport.label}`;

  addCoverSlide(pptx, rapport);
  addEffectifsSlide(pptx, rapport);
  addRecrutementsAbsenteismeTurnoverSlide(pptx, rapport);
  addDefinitionsSlide(pptx);

  const buf = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(buf as Buffer);
}
