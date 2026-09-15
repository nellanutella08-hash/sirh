import "server-only";

/** Live read-only integration with the two Google Sheets Ornella already
 * maintains by hand — the recruitment pipeline and the departures log (both
 * live tabs of the same spreadsheet). Per her explicit choice, these sheets
 * *replace* manual entry in the app rather than being merely linked: there
 * is no local copy/cache, every render fetches the sheet's current CSV
 * export directly. Both sheets must stay shared "anyone with the link can
 * view" for this to work — if she ever tightens sharing, these fetches
 * start failing and callers surface that plainly rather than silently
 * showing stale/empty data. */

const PIPELINE_SHEET_ID = "1oQ9_WAEe29kjJaalVvIVIVn7GJFsusIvtE568BfrD6w";
const PIPELINE_GID = "1098186350"; // " Saisie simple"
const DEPARTS_GID = "478408817"; // "Départs 2026"

function csvExportUrl(sheetId: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

export class GoogleSheetError extends Error {}

async function fetchCsv(sheetId: string, gid: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(csvExportUrl(sheetId, gid), { cache: "no-store" });
  } catch {
    throw new GoogleSheetError("Impossible de joindre Google Sheets (réseau).");
  }
  if (!res.ok) {
    throw new GoogleSheetError(
      `Le fichier Google Sheets n'est pas accessible (HTTP ${res.status}) — vérifiez que le partage est bien "Toute personne disposant du lien peut consulter".`
    );
  }
  return res.text();
}

/** Minimal RFC4180 CSV parser — Google's export quotes any field containing
 * a comma/newline/quote, so a naive split(",") silently corrupts rows (e.g.
 * an email address pasted as "last,first@x" in one cell). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // swallow, \n handles the row break
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const MOIS_FR: Record<string, number> = {
  janvier: 1,
  février: 2,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
};

/** Parses either "D/M/YYYY" (any padding) or French textual "DD moisNom
 * YYYY" (e.g. "22 mai 2026") — both appear, sometimes in the same column,
 * across these two sheets. Returns an ISO yyyy-mm-dd date string, or null
 * for blank/unparseable cells. */
export function parseSheetDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;

  const numeric = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (numeric) {
    const [, d, m, y] = numeric;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const textual = v.match(/^(\d{1,2})\s+([a-zûéèA-ZÛÉÈ]+)\s+(\d{4})$/);
  if (textual) {
    const [, d, moisRaw, y] = textual;
    const mois = MOIS_FR[moisRaw.toLowerCase()];
    if (mois) return `${y}-${String(mois).padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

function findHeaderRow(rows: string[][], required: string[]): { header: string[]; dataRows: string[][] } {
  const idx = rows.findIndex((r) =>
    required.every((req) => r.some((cell) => cell.trim().toLowerCase() === req.toLowerCase()))
  );
  if (idx === -1) return { header: [], dataRows: [] };
  return { header: rows[idx], dataRows: rows.slice(idx + 1) };
}

function rowToObject(header: string[], row: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  header.forEach((h, i) => {
    if (h) obj[h.trim()] = (row[i] ?? "").trim();
  });
  return obj;
}

export interface PipelineRow {
  poste: string;
  departement: string;
  demandeur: string;
  mode: string;
  candidat: string;
  contratSigne: boolean;
  dateDebutContrat: string | null;
  etatPilotage: string;
  motif: string;
  statut: string;
  etapeActuelle: string;
}

export async function fetchPipelineRows(): Promise<PipelineRow[]> {
  const csv = await fetchCsv(PIPELINE_SHEET_ID, PIPELINE_GID);
  const rows = parseCsv(csv);
  const { header, dataRows } = findHeaderRow(rows, ["Poste", "Candidat"]);
  if (header.length === 0) return [];

  return dataRows
    .map((r) => rowToObject(header, r))
    .filter((o) => o["Candidat"])
    .map((o) => ({
      poste: o["Poste"] ?? "",
      departement: o["Département"] ?? "",
      demandeur: o["Demandeur du recrutement"] ?? "",
      mode: o["Mode"] ?? "",
      candidat: o["Candidat"] ?? "",
      contratSigne: (o["Contrat signé"] ?? "").trim().toLowerCase() === "oui",
      dateDebutContrat: parseSheetDate(o["Date début du contrat"]),
      etatPilotage: o["Etat pilotage"] ?? "",
      motif: o["Motif"] ?? "",
      statut: o["Statut"] ?? "",
      etapeActuelle: o["Etape actuelle"] ?? "",
    }));
}

export interface DepartRow {
  fullname: string;
  email: string;
  dateDepart: string | null;
  lieuTravail: string;
  typeContrat: string;
  fonction: string;
}

export async function fetchDeparts(): Promise<DepartRow[]> {
  const csv = await fetchCsv(PIPELINE_SHEET_ID, DEPARTS_GID);
  const rows = parseCsv(csv);
  const { header, dataRows } = findHeaderRow(rows, ["Noms et prénoms", "Date de départ"]);
  if (header.length === 0) return [];

  return dataRows
    .map((r) => rowToObject(header, r))
    .filter((o) => o["Noms et prénoms"])
    .map((o) => ({
      fullname: o["Noms et prénoms"] ?? "",
      email: o["Mail Synelia"] ?? "",
      dateDepart: parseSheetDate(o["Date de départ"]),
      lieuTravail: o["Lieu de travail"] ?? "",
      typeContrat: o["Type de contrat"] ?? "",
      fonction: o["Fonction"] ?? "",
    }));
}
