import "server-only";
import { neon } from "@neondatabase/serverless";

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

// ---------- recruitment pipeline ----------
// Unlike employe data, Neos has no candidate/ATS resource at all, so this
// is real, DB-backed state (not just a Neos cache) — it only works with
// DATABASE_URL configured (see CACHE_ENABLED).

export const CANDIDATE_STAGES = [
  "nouveau",
  "preselection",
  "entretien",
  "offre",
  "embauche",
  "refuse",
] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export interface Candidate {
  id: string;
  tenantId: number;
  fullname: string;
  poste: string;
  email: string | null;
  telephone: string | null;
  source: string | null;
  notes: string | null;
  stage: CandidateStage;
  cvPath: string | null;
  createdAt: string;
  updatedAt: string;
}

let candidatesSchemaReady: Promise<void> | null = null;

function ensureCandidatesSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!candidatesSchemaReady) {
    candidatesSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS candidates (
        id TEXT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        fullname TEXT NOT NULL,
        poste TEXT NOT NULL,
        email TEXT,
        telephone TEXT,
        source TEXT,
        notes TEXT,
        stage TEXT NOT NULL DEFAULT 'nouveau',
        cv_path TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
      .then(() => sql`CREATE INDEX IF NOT EXISTS candidates_tenant_idx ON candidates (tenant_id)`)
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure candidates schema", err);
      });
  }
  return candidatesSchemaReady;
}

function rowToCandidate(row: Record<string, unknown>): Candidate {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    fullname: row.fullname as string,
    poste: row.poste as string,
    email: (row.email as string) ?? null,
    telephone: (row.telephone as string) ?? null,
    source: (row.source as string) ?? null,
    notes: (row.notes as string) ?? null,
    stage: row.stage as CandidateStage,
    cvPath: (row.cv_path as string) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function listCandidates(tenantId: number): Promise<Candidate[]> {
  if (!sql) return [];
  await ensureCandidatesSchema();
  const rows = await sql`
    SELECT * FROM candidates WHERE tenant_id = ${tenantId} ORDER BY created_at DESC
  `;
  return rows.map(rowToCandidate);
}

export async function createCandidate(
  tenantId: number,
  data: {
    fullname: string;
    poste: string;
    email?: string | null;
    telephone?: string | null;
    source?: string | null;
    notes?: string | null;
    cvPath?: string | null;
  }
): Promise<Candidate> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureCandidatesSchema();
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO candidates (id, tenant_id, fullname, poste, email, telephone, source, notes, cv_path)
    VALUES (
      ${id}, ${tenantId}, ${data.fullname}, ${data.poste},
      ${data.email ?? null}, ${data.telephone ?? null}, ${data.source ?? null},
      ${data.notes ?? null}, ${data.cvPath ?? null}
    )
    RETURNING *
  `;
  return rowToCandidate(rows[0]);
}

export async function updateCandidate(
  tenantId: number,
  id: string,
  patch: Partial<{
    fullname: string;
    poste: string;
    email: string | null;
    telephone: string | null;
    source: string | null;
    notes: string | null;
    stage: CandidateStage;
    cvPath: string | null;
  }>
): Promise<Candidate | null> {
  if (!sql) return null;
  await ensureCandidatesSchema();
  const current = await sql`SELECT * FROM candidates WHERE id = ${id} AND tenant_id = ${tenantId}`;
  if (current.length === 0) return null;
  const c = rowToCandidate(current[0]);
  const merged = { ...c, ...patch };
  const rows = await sql`
    UPDATE candidates SET
      fullname = ${merged.fullname},
      poste = ${merged.poste},
      email = ${merged.email},
      telephone = ${merged.telephone},
      source = ${merged.source},
      notes = ${merged.notes},
      stage = ${merged.stage},
      cv_path = ${merged.cvPath},
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return rowToCandidate(rows[0]);
}

export async function deleteCandidate(tenantId: number, id: string): Promise<void> {
  if (!sql) return;
  await ensureCandidatesSchema();
  await sql`DELETE FROM candidates WHERE id = ${id} AND tenant_id = ${tenantId}`;
}

// ---------- évaluations (objectifs & appréciations) ----------
// Same story as candidates: no Neos resource for this, so it's real DB
// state. Employee identity (id/nom) is a snapshot from Neos at creation
// time — this app doesn't try to keep it live-synced.

export const EVALUATION_STATUTS = ["planifiee", "en_cours", "terminee"] as const;
export type EvaluationStatut = (typeof EVALUATION_STATUTS)[number];

export const OBJECTIF_STATUTS = ["a_faire", "en_cours", "atteint", "non_atteint"] as const;
export type ObjectifStatut = (typeof OBJECTIF_STATUTS)[number];

export interface Objectif {
  id: string;
  titre: string;
  description: string;
  statut: ObjectifStatut;
}

export interface Evaluation {
  id: string;
  tenantId: number;
  employeId: number;
  employeNom: string;
  periode: string;
  statut: EvaluationStatut;
  evaluateur: string;
  score: number | null;
  commentaire: string | null;
  objectifs: Objectif[];
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
        statut TEXT NOT NULL DEFAULT 'planifiee',
        evaluateur TEXT NOT NULL,
        score NUMERIC,
        commentaire TEXT,
        objectifs JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
      .then(
        () =>
          sql`CREATE INDEX IF NOT EXISTS evaluations_tenant_idx ON evaluations (tenant_id)`
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
    periode: row.periode as string,
    statut: row.statut as EvaluationStatut,
    evaluateur: row.evaluateur as string,
    score: row.score === null ? null : Number(row.score),
    commentaire: (row.commentaire as string) ?? null,
    objectifs: (row.objectifs as Objectif[]) ?? [],
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

export async function createEvaluation(
  tenantId: number,
  data: {
    employeId: number;
    employeNom: string;
    periode: string;
    evaluateur: string;
    statut?: EvaluationStatut;
    objectifs?: Objectif[];
  }
): Promise<Evaluation> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureEvaluationsSchema();
  const id = crypto.randomUUID();
  const objectifs = JSON.stringify(data.objectifs ?? []);
  const rows = await sql`
    INSERT INTO evaluations (id, tenant_id, employe_id, employe_nom, periode, statut, evaluateur, objectifs)
    VALUES (
      ${id}, ${tenantId}, ${data.employeId}, ${data.employeNom}, ${data.periode},
      ${data.statut ?? "planifiee"}, ${data.evaluateur}, ${objectifs}::jsonb
    )
    RETURNING *
  `;
  return rowToEvaluation(rows[0]);
}

export async function updateEvaluation(
  tenantId: number,
  id: string,
  patch: Partial<{
    periode: string;
    statut: EvaluationStatut;
    evaluateur: string;
    score: number | null;
    commentaire: string | null;
    objectifs: Objectif[];
  }>
): Promise<Evaluation | null> {
  if (!sql) return null;
  await ensureEvaluationsSchema();
  const current = await sql`SELECT * FROM evaluations WHERE id = ${id} AND tenant_id = ${tenantId}`;
  if (current.length === 0) return null;
  const e = rowToEvaluation(current[0]);
  const merged = { ...e, ...patch };
  const objectifsJson = JSON.stringify(merged.objectifs);
  const rows = await sql`
    UPDATE evaluations SET
      periode = ${merged.periode},
      statut = ${merged.statut},
      evaluateur = ${merged.evaluateur},
      score = ${merged.score},
      commentaire = ${merged.commentaire},
      objectifs = ${objectifsJson}::jsonb,
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return rowToEvaluation(rows[0]);
}

export async function deleteEvaluation(tenantId: number, id: string): Promise<void> {
  if (!sql) return;
  await ensureEvaluationsSchema();
  await sql`DELETE FROM evaluations WHERE id = ${id} AND tenant_id = ${tenantId}`;
}

// ---------- demandes de documents ----------
// Another real DB-backed module (no Neos resource for this either): common
// HR document requests (attestation de travail, bulletin de paie, ...).

export const DOCUMENT_TYPES = [
  "Attestation de travail",
  "Bulletin de paie",
  "Certificat de travail",
  "Certificat/attestation de consultance",
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

export async function createDocumentRequest(
  tenantId: number,
  data: { employeId: number; employeNom: string; typeDocument: string; commentaire?: string | null }
): Promise<DocumentRequest> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureDocumentRequestsSchema();
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO document_requests (id, tenant_id, employe_id, employe_nom, type_document, commentaire)
    VALUES (${id}, ${tenantId}, ${data.employeId}, ${data.employeNom}, ${data.typeDocument}, ${data.commentaire ?? null})
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
