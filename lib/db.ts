import "server-only";
import { neon } from "@neondatabase/serverless";
import { computeNextSolde } from "./format";

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

const sql = DB_URL ? neon(DB_URL) : null;

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS employes_cache (
        tenant_id BIGINT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure employes_cache schema", err);
      });
  }
  return schemaReady;
}

export const CACHE_ENABLED = Boolean(sql);

/** Reads the cached employe payload for a tenant. Returns null if no cache
 * layer is configured (no DATABASE_URL), the row doesn't exist yet, or the
 * read fails for any reason — callers should treat null as "fetch fresh". */
export async function readEmployesCache(
  tenantId: number
): Promise<{ payload: unknown; updatedAt: Date } | null> {
  if (!sql) return null;
  try {
    await ensureSchema();
    const rows = await sql`
      SELECT payload, updated_at FROM employes_cache WHERE tenant_id = ${tenantId}
    `;
    if (rows.length === 0) return null;
    return { payload: rows[0].payload, updatedAt: new Date(rows[0].updated_at as string) };
  } catch (err) {
    console.error("[db] readEmployesCache failed", err);
    return null;
  }
}

/** Best-effort write; failures are logged but never thrown so a caching
 * outage can't take down the app. */
export async function writeEmployesCache(tenantId: number, payload: unknown): Promise<void> {
  if (!sql) return;
  try {
    await ensureSchema();
    const json = JSON.stringify(payload);
    await sql`
      INSERT INTO employes_cache (tenant_id, payload, updated_at)
      VALUES (${tenantId}, ${json}::jsonb, now())
      ON CONFLICT (tenant_id)
      DO UPDATE SET payload = ${json}::jsonb, updated_at = now()
    `;
  } catch (err) {
    console.error("[db] writeEmployesCache failed", err);
  }
}

// Recruitment pipeline used to be a DB-backed manual Kanban here (no Neos
// ATS resource exists) — it's now sourced live from Ornella's own Google
// Sheets pipeline instead (see lib/googleSheets.ts), so there's no DB
// table for it anymore. The old `candidates` table, if it still exists in
// a given database, is simply unused going forward.

// ---------- évaluations (fiches d'objectifs, auto-éval, notation) ----------
// Same story as candidates: no Neos resource for this, so it's real DB
// state. Employee/manager identity (id/nom) is a snapshot from Neos at
// creation time — this app doesn't try to keep it live-synced.
//
// Lifecycle of one fiche (one employee x one année):
//   brouillon   -> the manager is drafting objectifs, invisible to the employee
//   assignee    -> objectifs sent, employee can self-assess
//   auto_eval   -> employee has submitted their self-assessment
//   terminee    -> manager has completed the interview notation (final score set)
// `periode` (DB column) holds the année ("2026"), `evaluateur` holds the
// responsable's display name — kept under their original column names to
// avoid a migration, since both mean the same thing conceptually.

export const EVALUATION_STATUTS = ["brouillon", "assignee", "auto_eval", "terminee"] as const;
export type EvaluationStatut = (typeof EVALUATION_STATUTS)[number];

export const NIVEAU_ATTEINTE = ["non_atteint", "partiel", "atteint", "depasse"] as const;
export type NiveauAtteinte = (typeof NIVEAU_ATTEINTE)[number];

/** Points obtained on an objectif = points proposés × ce multiplicateur. */
export const NIVEAU_MULTIPLIER: Record<NiveauAtteinte, number> = {
  non_atteint: 0,
  partiel: 0.5,
  atteint: 1,
  depasse: 1.2,
};

export interface ObjectifLigne {
  id: string;
  numero: number;
  categorie: string;
  objectif: string;
  livrables: string;
  indicateur: string;
  echeance: string;
  points: number;
  autoNiveau: NiveauAtteinte | null;
  autoCommentaire: string | null;
  managerNiveau: NiveauAtteinte | null;
  managerCommentaire: string | null;
}

export interface Evaluation {
  id: string;
  tenantId: number;
  employeId: number;
  employeNom: string;
  poste: string;
  departement: string;
  responsableId: number | null;
  responsableNom: string;
  annee: string;
  statut: EvaluationStatut;
  objectifs: ObjectifLigne[];
  commentaireManager: string | null;
  scoreFinal: number | null;
  createdAt: string;
  updatedAt: string;
}

let evaluationsSchemaReady: Promise<void> | null = null;

function ensureEvaluationsSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!evaluationsSchemaReady) {
    evaluationsSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS evaluations (
        id TEXT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        employe_id BIGINT NOT NULL,
        employe_nom TEXT NOT NULL,
        periode TEXT NOT NULL,
        statut TEXT NOT NULL DEFAULT 'brouillon',
        evaluateur TEXT NOT NULL,
        score NUMERIC,
        commentaire TEXT,
        objectifs JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
      .then(() => sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS poste TEXT NOT NULL DEFAULT ''`)
      .then(() => sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS departement TEXT NOT NULL DEFAULT ''`)
      .then(() => sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS responsable_id BIGINT`)
      .then(() => sql`CREATE INDEX IF NOT EXISTS evaluations_tenant_idx ON evaluations (tenant_id)`)
      .then(
        () =>
          sql`CREATE INDEX IF NOT EXISTS evaluations_employe_idx ON evaluations (tenant_id, employe_id)`
      )
      .then(
        () =>
          sql`CREATE INDEX IF NOT EXISTS evaluations_responsable_idx ON evaluations (tenant_id, responsable_id)`
      )
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure evaluations schema", err);
      });
  }
  return evaluationsSchemaReady;
}

function rowToEvaluation(row: Record<string, unknown>): Evaluation {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    employeId: Number(row.employe_id),
    employeNom: row.employe_nom as string,
    poste: (row.poste as string) ?? "",
    departement: (row.departement as string) ?? "",
    responsableId: row.responsable_id != null ? Number(row.responsable_id) : null,
    responsableNom: row.evaluateur as string,
    annee: row.periode as string,
    statut: row.statut as EvaluationStatut,
    objectifs: (row.objectifs as ObjectifLigne[]) ?? [],
    commentaireManager: (row.commentaire as string) ?? null,
    scoreFinal: row.score === null ? null : Number(row.score),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function listEvaluations(tenantId: number): Promise<Evaluation[]> {
  if (!sql) return [];
  await ensureEvaluationsSchema();
  const rows = await sql`
    SELECT * FROM evaluations WHERE tenant_id = ${tenantId} ORDER BY created_at DESC
  `;
  return rows.map(rowToEvaluation);
}

/** Fiches belonging to one employee — excludes brouillon (still being
 * drafted by their manager, not their business yet) unless the employee is
 * themself the responsable (edge case: shouldn't really happen, kept safe). */
export async function listEvaluationsForEmploye(
  tenantId: number,
  employeId: number
): Promise<Evaluation[]> {
  if (!sql) return [];
  await ensureEvaluationsSchema();
  const rows = await sql`
    SELECT * FROM evaluations
    WHERE tenant_id = ${tenantId} AND employe_id = ${employeId}
      AND (statut != 'brouillon' OR responsable_id = ${employeId})
    ORDER BY periode DESC, created_at DESC
  `;
  return rows.map(rowToEvaluation);
}

/** Fiches a given manager owns (created for their direct reports). */
export async function listEvaluationsManagedBy(
  tenantId: number,
  responsableId: number
): Promise<Evaluation[]> {
  if (!sql) return [];
  await ensureEvaluationsSchema();
  const rows = await sql`
    SELECT * FROM evaluations
    WHERE tenant_id = ${tenantId} AND responsable_id = ${responsableId}
    ORDER BY created_at DESC
  `;
  return rows.map(rowToEvaluation);
}

export async function getEvaluation(tenantId: number, id: string): Promise<Evaluation | null> {
  if (!sql) return null;
  await ensureEvaluationsSchema();
  const rows = await sql`SELECT * FROM evaluations WHERE id = ${id} AND tenant_id = ${tenantId}`;
  return rows[0] ? rowToEvaluation(rows[0]) : null;
}

export async function createEvaluation(
  tenantId: number,
  data: {
    employeId: number;
    employeNom: string;
    poste: string;
    departement: string;
    responsableId: number | null;
    responsableNom: string;
    annee: string;
  }
): Promise<Evaluation> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureEvaluationsSchema();
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO evaluations
      (id, tenant_id, employe_id, employe_nom, poste, departement, responsable_id, evaluateur, periode, statut, objectifs)
    VALUES (
      ${id}, ${tenantId}, ${data.employeId}, ${data.employeNom}, ${data.poste}, ${data.departement},
      ${data.responsableId}, ${data.responsableNom}, ${data.annee}, 'brouillon', '[]'::jsonb
    )
    RETURNING *
  `;
  return rowToEvaluation(rows[0]);
}

/** Manager/RH editing objectif lines while the fiche is still a brouillon —
 * returns null if the fiche isn't found or has already been assignée (past
 * that point, objectifs are frozen; only auto-éval/notation touch them). */
export async function setEvaluationObjectifs(
  tenantId: number,
  id: string,
  data: { poste: string; departement: string; objectifs: ObjectifLigne[] }
): Promise<Evaluation | null> {
  if (!sql) return null;
  await ensureEvaluationsSchema();
  const rows = await sql`
    UPDATE evaluations SET
      poste = ${data.poste},
      departement = ${data.departement},
      objectifs = ${JSON.stringify(data.objectifs)}::jsonb,
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId} AND statut = 'brouillon'
    RETURNING *
  `;
  return rows[0] ? rowToEvaluation(rows[0]) : null;
}

export async function assignerEvaluation(tenantId: number, id: string): Promise<Evaluation | null> {
  if (!sql) return null;
  await ensureEvaluationsSchema();
  const rows = await sql`
    UPDATE evaluations SET statut = 'assignee', updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId} AND statut = 'brouillon'
    RETURNING *
  `;
  return rows[0] ? rowToEvaluation(rows[0]) : null;
}

export async function submitAutoEval(
  tenantId: number,
  id: string,
  patch: { id: string; autoNiveau: NiveauAtteinte | null; autoCommentaire: string | null }[]
): Promise<Evaluation | null> {
  if (!sql) return null;
  await ensureEvaluationsSchema();
  const current = await sql`
    SELECT * FROM evaluations
    WHERE id = ${id} AND tenant_id = ${tenantId} AND statut IN ('assignee', 'auto_eval')
  `;
  if (current.length === 0) return null;
  const e = rowToEvaluation(current[0]);
  const patchMap = new Map(patch.map((p) => [p.id, p]));
  const objectifs = e.objectifs.map((o) => {
    const p = patchMap.get(o.id);
    return p ? { ...o, autoNiveau: p.autoNiveau, autoCommentaire: p.autoCommentaire } : o;
  });
  const rows = await sql`
    UPDATE evaluations SET
      objectifs = ${JSON.stringify(objectifs)}::jsonb,
      statut = 'auto_eval',
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return rowToEvaluation(rows[0]);
}

export async function submitNotation(
  tenantId: number,
  id: string,
  data: {
    objectifs: { id: string; managerNiveau: NiveauAtteinte | null; managerCommentaire: string | null }[];
    commentaireManager: string | null;
  }
): Promise<Evaluation | null> {
  if (!sql) return null;
  await ensureEvaluationsSchema();
  const current = await sql`
    SELECT * FROM evaluations
    WHERE id = ${id} AND tenant_id = ${tenantId} AND statut IN ('assignee', 'auto_eval')
  `;
  if (current.length === 0) return null;
  const e = rowToEvaluation(current[0]);
  const patchMap = new Map(data.objectifs.map((p) => [p.id, p]));
  const objectifs = e.objectifs.map((o) => {
    const p = patchMap.get(o.id);
    return p ? { ...o, managerNiveau: p.managerNiveau, managerCommentaire: p.managerCommentaire } : o;
  });
  const scoreFinal = objectifs.reduce(
    (sum, o) => sum + (o.managerNiveau ? o.points * NIVEAU_MULTIPLIER[o.managerNiveau] : 0),
    0
  );
  const rows = await sql`
    UPDATE evaluations SET
      objectifs = ${JSON.stringify(objectifs)}::jsonb,
      commentaire = ${data.commentaireManager},
      score = ${Math.round(scoreFinal * 10) / 10},
      statut = 'terminee',
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return rowToEvaluation(rows[0]);
}

/** Only a brouillon can be deleted — past that point it's part of the
 * collaborateur's real history. Returns false if not found/not a brouillon. */
export async function deleteEvaluation(tenantId: number, id: string): Promise<boolean> {
  if (!sql) return false;
  await ensureEvaluationsSchema();
  const rows = await sql`
    DELETE FROM evaluations WHERE id = ${id} AND tenant_id = ${tenantId} AND statut = 'brouillon'
    RETURNING id
  `;
  return rows.length > 0;
}

// ---------- demandes de documents ----------
// Another real DB-backed module (no Neos resource for this either): common
// HR document requests (attestation de travail, bulletin de paie, ...).

export const DOCUMENT_TYPES = [
  "Attestation de travail",
  "Attestation de prise en charge",
  "Ordre de mission",
  "Bulletin de paie",
  "Certificat de travail",
  "Certificat/attestation de consultance",
  "Attestation de versement d'honoraires",
  "Attestation de salaire",
  "Certificat médical",
  "Attestation de stage",
  "Attestation CNPS",
  "Solde de tout compte",
  "Lettre de recommandation",
  "Autre",
] as const;

export const DOCUMENT_REQUEST_STATUTS = ["demandee", "en_traitement", "prete", "remise", "refusee"] as const;
export type DocumentRequestStatut = (typeof DOCUMENT_REQUEST_STATUTS)[number];

export interface DocumentRequest {
  id: string;
  tenantId: number;
  employeId: number;
  employeNom: string;
  typeDocument: string;
  statut: DocumentRequestStatut;
  commentaire: string | null;
  filePath: string | null;
  // Extra context needed by specific letter types (Ordre de mission,
  // Attestation de prise en charge, Attestation de versement d'honoraires)
  // that a plain commentaire can't capture in a structured way.
  destination: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  objet: string | null;
  lieuNaissance: string | null;
  montantHonoraires: number | null;
  dateSignatureContrat: string | null;
  createdAt: string;
  updatedAt: string;
}

let documentRequestsSchemaReady: Promise<void> | null = null;

function ensureDocumentRequestsSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!documentRequestsSchemaReady) {
    documentRequestsSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS document_requests (
        id TEXT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        employe_id BIGINT NOT NULL,
        employe_nom TEXT NOT NULL,
        type_document TEXT NOT NULL,
        statut TEXT NOT NULL DEFAULT 'demandee',
        commentaire TEXT,
        file_path TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
      .then(
        () =>
          sql`CREATE INDEX IF NOT EXISTS document_requests_tenant_idx ON document_requests (tenant_id)`
      )
      .then(() => sql`ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS destination TEXT`)
      .then(() => sql`ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS date_debut TEXT`)
      .then(() => sql`ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS date_fin TEXT`)
      .then(() => sql`ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS objet TEXT`)
      .then(() => sql`ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS lieu_naissance TEXT`)
      .then(
        () => sql`ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS montant_honoraires NUMERIC`
      )
      .then(
        () =>
          sql`ALTER TABLE document_requests ADD COLUMN IF NOT EXISTS date_signature_contrat TEXT`
      )
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure document_requests schema", err);
      });
  }
  return documentRequestsSchemaReady;
}

function rowToDocumentRequest(row: Record<string, unknown>): DocumentRequest {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    employeId: Number(row.employe_id),
    employeNom: row.employe_nom as string,
    typeDocument: row.type_document as string,
    statut: row.statut as DocumentRequestStatut,
    commentaire: (row.commentaire as string) ?? null,
    filePath: (row.file_path as string) ?? null,
    destination: (row.destination as string) ?? null,
    dateDebut: (row.date_debut as string) ?? null,
    dateFin: (row.date_fin as string) ?? null,
    objet: (row.objet as string) ?? null,
    lieuNaissance: (row.lieu_naissance as string) ?? null,
    montantHonoraires: row.montant_honoraires != null ? Number(row.montant_honoraires) : null,
    dateSignatureContrat: (row.date_signature_contrat as string) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function listDocumentRequests(tenantId: number): Promise<DocumentRequest[]> {
  if (!sql) return [];
  await ensureDocumentRequestsSchema();
  const rows = await sql`
    SELECT * FROM document_requests WHERE tenant_id = ${tenantId} ORDER BY created_at DESC
  `;
  return rows.map(rowToDocumentRequest);
}

/** Same as listDocumentRequests, scoped to one collaborateur — used by the
 * self-service "Mes documents" view so it never sees anyone else's. */
export async function listDocumentRequestsForEmploye(
  tenantId: number,
  employeId: number
): Promise<DocumentRequest[]> {
  if (!sql) return [];
  await ensureDocumentRequestsSchema();
  const rows = await sql`
    SELECT * FROM document_requests
    WHERE tenant_id = ${tenantId} AND employe_id = ${employeId}
    ORDER BY created_at DESC
  `;
  return rows.map(rowToDocumentRequest);
}

export async function getDocumentRequest(
  tenantId: number,
  id: string
): Promise<DocumentRequest | null> {
  if (!sql) return null;
  await ensureDocumentRequestsSchema();
  const rows = await sql`
    SELECT * FROM document_requests WHERE id = ${id} AND tenant_id = ${tenantId}
  `;
  return rows.length ? rowToDocumentRequest(rows[0]) : null;
}

export async function createDocumentRequest(
  tenantId: number,
  data: {
    employeId: number;
    employeNom: string;
    typeDocument: string;
    commentaire?: string | null;
    destination?: string | null;
    dateDebut?: string | null;
    dateFin?: string | null;
    objet?: string | null;
    lieuNaissance?: string | null;
    montantHonoraires?: number | null;
    dateSignatureContrat?: string | null;
  }
): Promise<DocumentRequest> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureDocumentRequestsSchema();
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO document_requests (
      id, tenant_id, employe_id, employe_nom, type_document, commentaire,
      destination, date_debut, date_fin, objet, lieu_naissance, montant_honoraires, date_signature_contrat
    )
    VALUES (
      ${id}, ${tenantId}, ${data.employeId}, ${data.employeNom}, ${data.typeDocument}, ${data.commentaire ?? null},
      ${data.destination ?? null}, ${data.dateDebut ?? null}, ${data.dateFin ?? null}, ${data.objet ?? null},
      ${data.lieuNaissance ?? null}, ${data.montantHonoraires ?? null}, ${data.dateSignatureContrat ?? null}
    )
    RETURNING *
  `;
  return rowToDocumentRequest(rows[0]);
}

export async function updateDocumentRequest(
  tenantId: number,
  id: string,
  patch: Partial<{
    statut: DocumentRequestStatut;
    commentaire: string | null;
    filePath: string | null;
  }>
): Promise<DocumentRequest | null> {
  if (!sql) return null;
  await ensureDocumentRequestsSchema();
  const current = await sql`SELECT * FROM document_requests WHERE id = ${id} AND tenant_id = ${tenantId}`;
  if (current.length === 0) return null;
  const d = rowToDocumentRequest(current[0]);
  const merged = { ...d, ...patch };
  const rows = await sql`
    UPDATE document_requests SET
      statut = ${merged.statut},
      commentaire = ${merged.commentaire},
      file_path = ${merged.filePath},
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return rowToDocumentRequest(rows[0]);
}

export async function deleteDocumentRequest(tenantId: number, id: string): Promise<void> {
  if (!sql) return;
  await ensureDocumentRequestsSchema();
  await sql`DELETE FROM document_requests WHERE id = ${id} AND tenant_id = ${tenantId}`;
}

// Legal identity per entité (raison sociale, capital, RCCM, représentant
// légal...) — needed to generate attestations/ordres de mission that match
// the real letterhead templates, but Neos doesn't expose most of it, so
// (like manager_overrides) this is RH-editable, keyed by Neos's entité id.
export interface EntiteLegalInfo {
  entiteId: number;
  raisonSociale: string;
  formeJuridique: string;
  capitalFcfa: number | null;
  capitalLettres: string | null;
  siege: string;
  rccm: string;
  compteContribuable: string;
  telephone: string;
  representantCivilite: string;
  representantNom: string;
  representantTitre: string;
  signataireTitre: string;
  villeSignature: string;
  piedDePage: string;
  updatedAt: string;
}

let entiteLegalInfoSchemaReady: Promise<void> | null = null;

function ensureEntiteLegalInfoSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!entiteLegalInfoSchemaReady) {
    entiteLegalInfoSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS entite_legal_info (
        tenant_id BIGINT NOT NULL,
        entite_id BIGINT NOT NULL,
        raison_sociale TEXT NOT NULL,
        forme_juridique TEXT NOT NULL DEFAULT '',
        capital_fcfa NUMERIC,
        capital_lettres TEXT,
        siege TEXT NOT NULL DEFAULT '',
        rccm TEXT NOT NULL DEFAULT '',
        compte_contribuable TEXT NOT NULL DEFAULT '',
        telephone TEXT NOT NULL DEFAULT '',
        representant_civilite TEXT NOT NULL DEFAULT 'Monsieur',
        representant_nom TEXT NOT NULL DEFAULT '',
        representant_titre TEXT NOT NULL DEFAULT '',
        signataire_titre TEXT NOT NULL DEFAULT '',
        ville_signature TEXT NOT NULL DEFAULT 'Abidjan',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, entite_id)
      )
    `
      .then(() => sql`ALTER TABLE entite_legal_info ADD COLUMN IF NOT EXISTS pied_de_page TEXT NOT NULL DEFAULT ''`)
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure entite_legal_info schema", err);
      });
  }
  return entiteLegalInfoSchemaReady;
}

function rowToEntiteLegalInfo(row: Record<string, unknown>): EntiteLegalInfo {
  return {
    entiteId: Number(row.entite_id),
    raisonSociale: row.raison_sociale as string,
    formeJuridique: row.forme_juridique as string,
    capitalFcfa: row.capital_fcfa != null ? Number(row.capital_fcfa) : null,
    capitalLettres: (row.capital_lettres as string) ?? null,
    siege: row.siege as string,
    rccm: row.rccm as string,
    compteContribuable: row.compte_contribuable as string,
    telephone: row.telephone as string,
    representantCivilite: row.representant_civilite as string,
    representantNom: row.representant_nom as string,
    representantTitre: row.representant_titre as string,
    signataireTitre: row.signataire_titre as string,
    villeSignature: row.ville_signature as string,
    piedDePage: (row.pied_de_page as string) ?? "",
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function getEntiteLegalInfos(tenantId: number): Promise<Map<number, EntiteLegalInfo>> {
  if (!sql) return new Map();
  await ensureEntiteLegalInfoSchema();
  const rows = await sql`SELECT * FROM entite_legal_info WHERE tenant_id = ${tenantId}`;
  const map = new Map<number, EntiteLegalInfo>();
  for (const row of rows) {
    const info = rowToEntiteLegalInfo(row);
    map.set(info.entiteId, info);
  }
  return map;
}

export async function getEntiteLegalInfo(
  tenantId: number,
  entiteId: number
): Promise<EntiteLegalInfo | null> {
  if (!sql) return null;
  await ensureEntiteLegalInfoSchema();
  const rows = await sql`
    SELECT * FROM entite_legal_info WHERE tenant_id = ${tenantId} AND entite_id = ${entiteId}
  `;
  return rows.length ? rowToEntiteLegalInfo(rows[0]) : null;
}

export async function setEntiteLegalInfo(
  tenantId: number,
  entiteId: number,
  data: Omit<EntiteLegalInfo, "entiteId" | "updatedAt">
): Promise<EntiteLegalInfo> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureEntiteLegalInfoSchema();
  const rows = await sql`
    INSERT INTO entite_legal_info (
      tenant_id, entite_id, raison_sociale, forme_juridique, capital_fcfa, capital_lettres,
      siege, rccm, compte_contribuable, telephone,
      representant_civilite, representant_nom, representant_titre, signataire_titre, ville_signature,
      pied_de_page, updated_at
    )
    VALUES (
      ${tenantId}, ${entiteId}, ${data.raisonSociale}, ${data.formeJuridique}, ${data.capitalFcfa}, ${data.capitalLettres},
      ${data.siege}, ${data.rccm}, ${data.compteContribuable}, ${data.telephone},
      ${data.representantCivilite}, ${data.representantNom}, ${data.representantTitre}, ${data.signataireTitre}, ${data.villeSignature},
      ${data.piedDePage}, now()
    )
    ON CONFLICT (tenant_id, entite_id) DO UPDATE SET
      raison_sociale = ${data.raisonSociale},
      forme_juridique = ${data.formeJuridique},
      capital_fcfa = ${data.capitalFcfa},
      capital_lettres = ${data.capitalLettres},
      siege = ${data.siege},
      rccm = ${data.rccm},
      compte_contribuable = ${data.compteContribuable},
      telephone = ${data.telephone},
      representant_civilite = ${data.representantCivilite},
      representant_nom = ${data.representantNom},
      representant_titre = ${data.representantTitre},
      signataire_titre = ${data.signataireTitre},
      ville_signature = ${data.villeSignature},
      pied_de_page = ${data.piedDePage},
      updated_at = now()
    RETURNING *
  `;
  return rowToEntiteLegalInfo(rows[0]);
}

// Affectation du personnel (catégorie, régie, pôle technique/support,
// classification, type de projet) — vient du "fichier consolidé du
// personnel" que RH tient à jour elle-même en dehors de Neos (staffing,
// pas un attribut RH classique), donc pas dans Neos du tout. Importé une
// fois depuis ce fichier puis modifiable directement dans le SIRH, exactement
// comme entite_legal_info/manager_overrides ci-dessus — keyed par employeId
// Neos plutôt que par nom, pour rester valable même si Neos renomme/renumérote.
export interface PersonnelAffectation {
  employeId: number;
  categorie: string | null;
  regie: string | null;
  poleTechSupport: string | null;
  classification: "regie" | "hors_regie" | null;
  typeProjet: string | null;
  updatedAt: string;
}

let personnelAffectationSchemaReady: Promise<void> | null = null;

function ensurePersonnelAffectationSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!personnelAffectationSchemaReady) {
    personnelAffectationSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS personnel_affectation (
        tenant_id BIGINT NOT NULL,
        employe_id BIGINT NOT NULL,
        categorie TEXT,
        regie TEXT,
        pole_tech_support TEXT,
        classification TEXT,
        type_projet TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, employe_id)
      )
    `
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure personnel_affectation schema", err);
      });
  }
  return personnelAffectationSchemaReady;
}

function rowToPersonnelAffectation(row: Record<string, unknown>): PersonnelAffectation {
  return {
    employeId: Number(row.employe_id),
    categorie: (row.categorie as string) ?? null,
    regie: (row.regie as string) ?? null,
    poleTechSupport: (row.pole_tech_support as string) ?? null,
    classification: (row.classification as "regie" | "hors_regie") ?? null,
    typeProjet: (row.type_projet as string) ?? null,
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function getPersonnelAffectations(
  tenantId: number
): Promise<Map<number, PersonnelAffectation>> {
  if (!sql) return new Map();
  await ensurePersonnelAffectationSchema();
  const rows = await sql`SELECT * FROM personnel_affectation WHERE tenant_id = ${tenantId}`;
  const map = new Map<number, PersonnelAffectation>();
  for (const row of rows) {
    const info = rowToPersonnelAffectation(row);
    map.set(info.employeId, info);
  }
  return map;
}

export async function getPersonnelAffectation(
  tenantId: number,
  employeId: number
): Promise<PersonnelAffectation | null> {
  if (!sql) return null;
  await ensurePersonnelAffectationSchema();
  const rows = await sql`
    SELECT * FROM personnel_affectation WHERE tenant_id = ${tenantId} AND employe_id = ${employeId}
  `;
  return rows.length ? rowToPersonnelAffectation(rows[0]) : null;
}

export async function setPersonnelAffectation(
  tenantId: number,
  employeId: number,
  data: Omit<PersonnelAffectation, "employeId" | "updatedAt">
): Promise<PersonnelAffectation> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensurePersonnelAffectationSchema();
  const rows = await sql`
    INSERT INTO personnel_affectation (
      tenant_id, employe_id, categorie, regie, pole_tech_support, classification, type_projet, updated_at
    )
    VALUES (
      ${tenantId}, ${employeId}, ${data.categorie}, ${data.regie}, ${data.poleTechSupport},
      ${data.classification}, ${data.typeProjet}, now()
    )
    ON CONFLICT (tenant_id, employe_id) DO UPDATE SET
      categorie = ${data.categorie},
      regie = ${data.regie},
      pole_tech_support = ${data.poleTechSupport},
      classification = ${data.classification},
      type_projet = ${data.typeProjet},
      updated_at = now()
    RETURNING *
  `;
  return rowToPersonnelAffectation(rows[0]);
}

// Turnover mensuel — Neos only ever exposes the *current* employee list
// (no historical roster), so month-by-month departures can't be derived
// from it at all. RH enters/imports this by hand, one row per
// "2026-08"-style year-month, for the "Tableau de bord RH Groupe" report
// (see lib/rapportMensuel.ts) — everything else that report needs
// (recrutements, absentéisme) IS derivable from data already in Neos/DB.
export interface TurnoverMensuel {
  yearMonth: string;
  departs: number;
  commentaire: string | null;
  updatedAt: string;
}

let turnoverMensuelSchemaReady: Promise<void> | null = null;

function ensureTurnoverMensuelSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!turnoverMensuelSchemaReady) {
    turnoverMensuelSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS turnover_mensuel (
        tenant_id BIGINT NOT NULL,
        year_month TEXT NOT NULL,
        departs INTEGER NOT NULL DEFAULT 0,
        commentaire TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, year_month)
      )
    `
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure turnover_mensuel schema", err);
      });
  }
  return turnoverMensuelSchemaReady;
}

function rowToTurnoverMensuel(row: Record<string, unknown>): TurnoverMensuel {
  return {
    yearMonth: row.year_month as string,
    departs: Number(row.departs),
    commentaire: (row.commentaire as string) ?? null,
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function getTurnoverMensuels(tenantId: number): Promise<Map<string, TurnoverMensuel>> {
  if (!sql) return new Map();
  await ensureTurnoverMensuelSchema();
  const rows = await sql`SELECT * FROM turnover_mensuel WHERE tenant_id = ${tenantId}`;
  const map = new Map<string, TurnoverMensuel>();
  for (const row of rows) {
    const t = rowToTurnoverMensuel(row);
    map.set(t.yearMonth, t);
  }
  return map;
}

export async function setTurnoverMensuel(
  tenantId: number,
  yearMonth: string,
  data: { departs: number; commentaire: string | null }
): Promise<TurnoverMensuel> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureTurnoverMensuelSchema();
  const rows = await sql`
    INSERT INTO turnover_mensuel (tenant_id, year_month, departs, commentaire, updated_at)
    VALUES (${tenantId}, ${yearMonth}, ${data.departs}, ${data.commentaire}, now())
    ON CONFLICT (tenant_id, year_month) DO UPDATE SET
      departs = ${data.departs},
      commentaire = ${data.commentaire},
      updated_at = now()
    RETURNING *
  `;
  return rowToTurnoverMensuel(rows[0]);
}

// Congés — demandes d'absence, calquées sur la fiche papier (motifs, avis de
// la hiérarchie puis visa RH, contact d'urgence, intérimaire). Distinct des
// onglets "Soldes" / "Saisie" de CongesModule, qui restent gérés localement
// (Neos ne fournit aucune ressource "solde de congés").
export const CONGE_MOTIFS = [
  "Congés annuels",
  "Maladie non professionnelle",
  "Accident du travail / maladie professionnelle",
  "Maladie d'un proche",
  "Congé formation",
  "Permission exceptionnelle",
  "Congés maternité",
  "Permission non exceptionnelle",
] as const;

export const CONGE_DEDUCTIONS = ["conges_annuels", "salaire"] as const;
export type CongeDeduction = (typeof CONGE_DEDUCTIONS)[number];

export const CONGE_AVIS_HIERARCHIE = [
  "en_attente",
  "favorable",
  "defavorable",
  "changement_demande",
] as const;
export type CongeAvisHierarchie = (typeof CONGE_AVIS_HIERARCHIE)[number];

export const CONGE_REQUEST_STATUTS = ["demandee", "validee", "refusee"] as const;
export type CongeRequestStatut = (typeof CONGE_REQUEST_STATUTS)[number];

export interface CongeRequest {
  id: string;
  tenantId: number;
  employeId: number;
  employeNom: string;
  managerId: number | null;
  managerNom: string | null;
  motif: string;
  motifDetail: string | null;
  dateDebut: string;
  dateFin: string;
  jours: number;
  // Optional second segment — a single fiche can combine e.g. a "Mariage du
  // travailleur" permission exceptionnelle (4j) with congés annuels
  // straight after, in one submission instead of two separate requests.
  motif2: string | null;
  motifDetail2: string | null;
  dateDebut2: string | null;
  dateFin2: string | null;
  jours2: number | null;
  dateReprise: string | null;
  deduction: CongeDeduction;
  contactUrgenceNom: string | null;
  contactUrgenceLien: string | null;
  contactUrgenceNumero: string | null;
  interimaires: string | null;
  justificatifPath: string | null;
  avisHierarchie: CongeAvisHierarchie;
  avisHierarchieMotif: string | null;
  statut: CongeRequestStatut;
  createdAt: string;
  updatedAt: string;
}

let congeRequestsSchemaReady: Promise<void> | null = null;

function ensureCongeRequestsSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!congeRequestsSchemaReady) {
    congeRequestsSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS conge_requests (
        id TEXT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        employe_id BIGINT NOT NULL,
        employe_nom TEXT NOT NULL,
        motif TEXT NOT NULL,
        motif_detail TEXT,
        date_debut TEXT NOT NULL,
        date_fin TEXT NOT NULL,
        jours INTEGER NOT NULL,
        date_reprise TEXT,
        deduction TEXT NOT NULL DEFAULT 'conges_annuels',
        contact_urgence_nom TEXT,
        contact_urgence_lien TEXT,
        contact_urgence_numero TEXT,
        interimaires TEXT,
        avis_hierarchie TEXT NOT NULL DEFAULT 'en_attente',
        avis_hierarchie_motif TEXT,
        statut TEXT NOT NULL DEFAULT 'demandee',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
      .then(
        () => sql`CREATE INDEX IF NOT EXISTS conge_requests_tenant_idx ON conge_requests (tenant_id)`
      )
      // Added after the table already existed in production — plain ADD
      // COLUMN IF NOT EXISTS instead of recreating the table.
      .then(() => sql`ALTER TABLE conge_requests ADD COLUMN IF NOT EXISTS manager_id BIGINT`)
      .then(() => sql`ALTER TABLE conge_requests ADD COLUMN IF NOT EXISTS manager_nom TEXT`)
      .then(
        () => sql`ALTER TABLE conge_requests ADD COLUMN IF NOT EXISTS justificatif_path TEXT`
      )
      .then(
        () =>
          sql`CREATE INDEX IF NOT EXISTS conge_requests_manager_idx ON conge_requests (manager_id)`
      )
      .then(() => sql`ALTER TABLE conge_requests ADD COLUMN IF NOT EXISTS motif2 TEXT`)
      .then(() => sql`ALTER TABLE conge_requests ADD COLUMN IF NOT EXISTS motif_detail2 TEXT`)
      .then(() => sql`ALTER TABLE conge_requests ADD COLUMN IF NOT EXISTS date_debut2 TEXT`)
      .then(() => sql`ALTER TABLE conge_requests ADD COLUMN IF NOT EXISTS date_fin2 TEXT`)
      .then(() => sql`ALTER TABLE conge_requests ADD COLUMN IF NOT EXISTS jours2 INTEGER`)
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure conge_requests schema", err);
      });
  }
  return congeRequestsSchemaReady;
}

function rowToCongeRequest(row: Record<string, unknown>): CongeRequest {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    employeId: Number(row.employe_id),
    employeNom: row.employe_nom as string,
    managerId: row.manager_id != null ? Number(row.manager_id) : null,
    managerNom: (row.manager_nom as string) ?? null,
    motif: row.motif as string,
    motifDetail: (row.motif_detail as string) ?? null,
    dateDebut: row.date_debut as string,
    dateFin: row.date_fin as string,
    jours: Number(row.jours),
    motif2: (row.motif2 as string) ?? null,
    motifDetail2: (row.motif_detail2 as string) ?? null,
    dateDebut2: (row.date_debut2 as string) ?? null,
    dateFin2: (row.date_fin2 as string) ?? null,
    jours2: row.jours2 != null ? Number(row.jours2) : null,
    dateReprise: (row.date_reprise as string) ?? null,
    deduction: row.deduction as CongeDeduction,
    contactUrgenceNom: (row.contact_urgence_nom as string) ?? null,
    contactUrgenceLien: (row.contact_urgence_lien as string) ?? null,
    contactUrgenceNumero: (row.contact_urgence_numero as string) ?? null,
    interimaires: (row.interimaires as string) ?? null,
    justificatifPath: (row.justificatif_path as string) ?? null,
    avisHierarchie: row.avis_hierarchie as CongeAvisHierarchie,
    avisHierarchieMotif: (row.avis_hierarchie_motif as string) ?? null,
    statut: row.statut as CongeRequestStatut,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function listCongeRequests(tenantId: number): Promise<CongeRequest[]> {
  if (!sql) return [];
  await ensureCongeRequestsSchema();
  const rows = await sql`
    SELECT * FROM conge_requests WHERE tenant_id = ${tenantId} ORDER BY created_at DESC
  `;
  return rows.map(rowToCongeRequest);
}

/** Same as listCongeRequests, scoped to one collaborateur — used by the
 * self-service "Mes congés" view so it never sees anyone else's. */
export async function listCongeRequestsForEmploye(
  tenantId: number,
  employeId: number
): Promise<CongeRequest[]> {
  if (!sql) return [];
  await ensureCongeRequestsSchema();
  const rows = await sql`
    SELECT * FROM conge_requests
    WHERE tenant_id = ${tenantId} AND employe_id = ${employeId}
    ORDER BY created_at DESC
  `;
  return rows.map(rowToCongeRequest);
}

export async function getCongeRequest(tenantId: number, id: string): Promise<CongeRequest | null> {
  if (!sql) return null;
  await ensureCongeRequestsSchema();
  const rows = await sql`SELECT * FROM conge_requests WHERE id = ${id} AND tenant_id = ${tenantId}`;
  return rows.length ? rowToCongeRequest(rows[0]) : null;
}

/** Requests awaiting (or having received) this manager's own avis — the
 * "Validations congés" self-service view, scoped by the manager snapshot
 * taken at submission time (see createCongeRequest). */
export async function listCongeRequestsManagedBy(
  tenantId: number,
  managerId: number
): Promise<CongeRequest[]> {
  if (!sql) return [];
  await ensureCongeRequestsSchema();
  const rows = await sql`
    SELECT * FROM conge_requests
    WHERE tenant_id = ${tenantId} AND manager_id = ${managerId}
    ORDER BY created_at DESC
  `;
  return rows.map(rowToCongeRequest);
}

export async function createCongeRequest(
  tenantId: number,
  data: {
    employeId: number;
    employeNom: string;
    managerId?: number | null;
    managerNom?: string | null;
    motif: string;
    motifDetail?: string | null;
    dateDebut: string;
    dateFin: string;
    jours: number;
    motif2?: string | null;
    motifDetail2?: string | null;
    dateDebut2?: string | null;
    dateFin2?: string | null;
    jours2?: number | null;
    dateReprise?: string | null;
    deduction: CongeDeduction;
    contactUrgenceNom?: string | null;
    contactUrgenceLien?: string | null;
    contactUrgenceNumero?: string | null;
    interimaires?: string | null;
  }
): Promise<CongeRequest> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureCongeRequestsSchema();
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO conge_requests (
      id, tenant_id, employe_id, employe_nom, manager_id, manager_nom, motif, motif_detail,
      date_debut, date_fin, jours, motif2, motif_detail2, date_debut2, date_fin2, jours2,
      date_reprise, deduction,
      contact_urgence_nom, contact_urgence_lien, contact_urgence_numero, interimaires
    )
    VALUES (
      ${id}, ${tenantId}, ${data.employeId}, ${data.employeNom}, ${data.managerId ?? null}, ${data.managerNom ?? null},
      ${data.motif}, ${data.motifDetail ?? null},
      ${data.dateDebut}, ${data.dateFin}, ${data.jours},
      ${data.motif2 ?? null}, ${data.motifDetail2 ?? null}, ${data.dateDebut2 ?? null}, ${data.dateFin2 ?? null}, ${data.jours2 ?? null},
      ${data.dateReprise ?? null}, ${data.deduction},
      ${data.contactUrgenceNom ?? null}, ${data.contactUrgenceLien ?? null}, ${data.contactUrgenceNumero ?? null}, ${data.interimaires ?? null}
    )
    RETURNING *
  `;
  return rowToCongeRequest(rows[0]);
}

export async function updateCongeRequest(
  tenantId: number,
  id: string,
  patch: Partial<{
    avisHierarchie: CongeAvisHierarchie;
    avisHierarchieMotif: string | null;
    statut: CongeRequestStatut;
    justificatifPath: string | null;
    dateDebut: string;
    dateFin: string;
    jours: number;
  }>
): Promise<CongeRequest | null> {
  if (!sql) return null;
  await ensureCongeRequestsSchema();
  const current = await sql`SELECT * FROM conge_requests WHERE id = ${id} AND tenant_id = ${tenantId}`;
  if (current.length === 0) return null;
  const d = rowToCongeRequest(current[0]);
  const merged = { ...d, ...patch };
  const rows = await sql`
    UPDATE conge_requests SET
      avis_hierarchie = ${merged.avisHierarchie},
      avis_hierarchie_motif = ${merged.avisHierarchieMotif},
      statut = ${merged.statut},
      justificatif_path = ${merged.justificatifPath},
      date_debut = ${merged.dateDebut},
      date_fin = ${merged.dateFin},
      jours = ${merged.jours},
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return rowToCongeRequest(rows[0]);
}

export async function deleteCongeRequest(tenantId: number, id: string): Promise<void> {
  if (!sql) return;
  await ensureCongeRequestsSchema();
  await sql`DELETE FROM conge_requests WHERE id = ${id} AND tenant_id = ${tenantId}`;
}

// Congé balances — Neos has no such resource, so this is real, DB-backed
// state: RH seeds CDI/CDD balances by hand, and a monthly cron
// (app/api/cron/conges-accrual) applies the accrual rules in lib/format.ts
// on top of it (see computeNextSolde). `last_accrual_ym` ("2026-03") makes
// a re-run for the same month a no-op instead of double-crediting.
export interface CongeSolde {
  employeId: number;
  solde: number;
  lastAccrualYm: string | null;
  updatedAt: string;
}

let congeSoldesSchemaReady: Promise<void> | null = null;

function ensureCongeSoldesSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!congeSoldesSchemaReady) {
    congeSoldesSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS conge_soldes (
        tenant_id BIGINT NOT NULL,
        employe_id BIGINT NOT NULL,
        solde NUMERIC NOT NULL DEFAULT 0,
        last_accrual_ym TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, employe_id)
      )
    `
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure conge_soldes schema", err);
      });
  }
  return congeSoldesSchemaReady;
}

function rowToCongeSolde(row: Record<string, unknown>): CongeSolde {
  return {
    employeId: Number(row.employe_id),
    solde: Number(row.solde),
    lastAccrualYm: (row.last_accrual_ym as string) ?? null,
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function getCongeSoldes(tenantId: number): Promise<Map<number, CongeSolde>> {
  if (!sql) return new Map();
  await ensureCongeSoldesSchema();
  const rows = await sql`SELECT * FROM conge_soldes WHERE tenant_id = ${tenantId}`;
  const map = new Map<number, CongeSolde>();
  for (const row of rows) {
    const s = rowToCongeSolde(row);
    map.set(s.employeId, s);
  }
  return map;
}

export async function getCongeSolde(tenantId: number, employeId: number): Promise<CongeSolde | null> {
  if (!sql) return null;
  await ensureCongeSoldesSchema();
  const rows = await sql`
    SELECT * FROM conge_soldes WHERE tenant_id = ${tenantId} AND employe_id = ${employeId}
  `;
  return rows.length ? rowToCongeSolde(rows[0]) : null;
}

/** RH manually setting/correcting a balance — leaves last_accrual_ym
 * untouched so the next monthly accrual still applies on top of it. */
export async function setCongeSolde(
  tenantId: number,
  employeId: number,
  solde: number
): Promise<CongeSolde> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureCongeSoldesSchema();
  const rows = await sql`
    INSERT INTO conge_soldes (tenant_id, employe_id, solde, updated_at)
    VALUES (${tenantId}, ${employeId}, ${solde}, now())
    ON CONFLICT (tenant_id, employe_id)
    DO UPDATE SET solde = ${solde}, updated_at = now()
    RETURNING *
  `;
  return rowToCongeSolde(rows[0]);
}

/** Every tenant that has ever had its employe list cached — the accrual
 * cron has no logged-in session of its own, so it runs off this cache
 * (refreshed hourly by ordinary RH traffic) rather than calling Neos. */
export async function listCachedTenantIds(): Promise<number[]> {
  if (!sql) return [];
  await ensureSchema();
  const rows = await sql`SELECT DISTINCT tenant_id FROM employes_cache`;
  return rows.map((r) => Number(r.tenant_id));
}

/** Applies one month of accrual to every employe passed in, skipping
 * anyone already credited for the current year-month. Returns counts for
 * the cron's own logging/response. */
export async function applyMonthlyAccrual(
  tenantId: number,
  employes: { id: number; contratType: string; dateEntree: string | null }[]
): Promise<{ updated: number; alreadyDone: number }> {
  if (!sql) return { updated: 0, alreadyDone: 0 };
  await ensureCongeSoldesSchema();
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const existing = await getCongeSoldes(tenantId);
  let updated = 0;
  let alreadyDone = 0;
  for (const e of employes) {
    const current = existing.get(e.id);
    if (current?.lastAccrualYm === ym) {
      alreadyDone++;
      continue;
    }
    const next = computeNextSolde(e, current?.solde ?? 0, now);
    await sql`
      INSERT INTO conge_soldes (tenant_id, employe_id, solde, last_accrual_ym, updated_at)
      VALUES (${tenantId}, ${e.id}, ${next}, ${ym}, now())
      ON CONFLICT (tenant_id, employe_id)
      DO UPDATE SET solde = ${next}, last_accrual_ym = ${ym}, updated_at = now()
    `;
    updated++;
  }
  return { updated, alreadyDone };
}

// Manager overrides — Neos exposes a `manager` field on users/contracts,
// mapped in lib/data.ts, but RH needs to be able to correct it by hand when
// it's missing or wrong in Neos without touching Neos itself.
export interface ManagerOverride {
  employeId: number;
  managerId: number | null;
  managerNom: string | null;
}

let managerOverridesSchemaReady: Promise<void> | null = null;

function ensureManagerOverridesSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!managerOverridesSchemaReady) {
    managerOverridesSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS manager_overrides (
        tenant_id BIGINT NOT NULL,
        employe_id BIGINT NOT NULL,
        manager_id BIGINT,
        manager_nom TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, employe_id)
      )
    `
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure manager_overrides schema", err);
      });
  }
  return managerOverridesSchemaReady;
}

/** All manager overrides for a tenant, keyed by employe id — merged over
 * Neos's own `manager` field in lib/data.ts (override wins when present). */
export async function getManagerOverrides(
  tenantId: number
): Promise<Map<number, { managerId: number | null; managerNom: string | null }>> {
  if (!sql) return new Map();
  await ensureManagerOverridesSchema();
  const rows = await sql`
    SELECT employe_id, manager_id, manager_nom FROM manager_overrides WHERE tenant_id = ${tenantId}
  `;
  const map = new Map<number, { managerId: number | null; managerNom: string | null }>();
  for (const row of rows) {
    map.set(Number(row.employe_id), {
      managerId: row.manager_id != null ? Number(row.manager_id) : null,
      managerNom: (row.manager_nom as string) ?? null,
    });
  }
  return map;
}

export async function setManagerOverride(
  tenantId: number,
  employeId: number,
  managerId: number | null,
  managerNom: string | null
): Promise<void> {
  if (!sql) return;
  await ensureManagerOverridesSchema();
  await sql`
    INSERT INTO manager_overrides (tenant_id, employe_id, manager_id, manager_nom)
    VALUES (${tenantId}, ${employeId}, ${managerId}, ${managerNom})
    ON CONFLICT (tenant_id, employe_id)
    DO UPDATE SET manager_id = ${managerId}, manager_nom = ${managerNom}, updated_at = now()
  `;
}

/** Reverts to whatever Neos itself reports for this employe's manager. */
export async function deleteManagerOverride(tenantId: number, employeId: number): Promise<void> {
  if (!sql) return;
  await ensureManagerOverridesSchema();
  await sql`DELETE FROM manager_overrides WHERE tenant_id = ${tenantId} AND employe_id = ${employeId}`;
}
