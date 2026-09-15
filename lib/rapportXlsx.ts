import "server-only";
import * as XLSX from "xlsx";
import type { RapportMensuel } from "@/lib/rapportMensuel";

/** Same report as rapportPdf, one sheet per domain, for RH to pivot/chart
 * in Excel rather than just read as a static document. */
export function renderRapportMensuelXlsx(rapport: RapportMensuel): Buffer {
  const wb = XLSX.utils.book_new();

  const effectifsRows = [
    ["Effectif total", rapport.effectifs.total],
    [],
    ["Par entité", ""],
    ...rapport.effectifs.parEntite,
    [],
    ["Par pôle", ""],
    ...rapport.effectifs.parPole,
    [],
    ["Par contrat", ""],
    ...rapport.effectifs.parContrat,
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(effectifsRows), "Effectifs");

  const recrutementsRows = [
    ["Nom", "Poste", "Date"],
    ...rapport.recrutements.liste.map((r) => [r.fullname, r.poste, r.date.slice(0, 10)]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recrutementsRows), "Recrutements");

  const absenteismeRows = [
    ["Jours d'absence", rapport.absenteisme.joursTotal],
    ["Taux (%)", rapport.absenteisme.tauxPct ?? ""],
    [],
    ["Entité", "Jours"],
    ...rapport.absenteisme.parEntite,
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(absenteismeRows), "Absenteisme");

  const turnoverRows = [
    ["Départs", rapport.turnover.departs ?? ""],
    ["Taux (%)", rapport.turnover.tauxPct ?? ""],
    ["Commentaire", rapport.turnover.commentaire ?? ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(turnoverRows), "Turnover");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
