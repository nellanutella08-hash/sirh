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
      date_debut, date_fin, jours, date_reprise, deduction,
      contact_urgence_nom, contact_urgence_lien, contact_urgence_numero, interimaires
    )
    VALUES (
      ${id}, ${tenantId}, ${data.employeId}, ${data.employeNom}, ${data.managerId ?? null}, ${data.managerNom ?? null},
      ${data.motif}, ${data.motifDetail ?? null},
      ${data.dateDebut}, ${data.dateFin}, ${data.jours}, ${data.dateReprise ?? null}, ${data.deduction},
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
