import "server-only";
import { neon } from "@neondatabase/serverless";
import { computeNextSolde } from "./format";

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

const sql = DB_URL ? neon(DB_URL) : null;

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = Promise.all([
      sql`
        CREATE TABLE IF NOT EXISTS employes_cache (
          tenant_id BIGINT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `,
      // Raw Neos profilePic paths, keyed by employe id — deliberately kept
      // out of employes_cache's payload (and so out of the Employe type
      // entirely): Neos serves these files with no auth of their own (see
      // resolveFileUrl in lib/neos.ts), so the path must never reach the
      // client. /api/photos/[id] reads this server-side only, resolves and
      // streams the image itself, gated by our own session check.
      sql`
        CREATE TABLE IF NOT EXISTS photo_paths_cache (
          tenant_id BIGINT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `,
    ])
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

/** Reads the cached photo-path map for a tenant: { [employeId]: rawNeosPath }.
 * Same null-on-any-failure contract as readEmployesCache. */
export async function readPhotoPathsCache(tenantId: number): Promise<Record<string, string> | null> {
  if (!sql) return null;
  try {
    await ensureSchema();
    const rows = await sql`
      SELECT payload FROM photo_paths_cache WHERE tenant_id = ${tenantId}
    `;
    if (rows.length === 0) return null;
    return rows[0].payload as Record<string, string>;
  } catch (err) {
    console.error("[db] readPhotoPathsCache failed", err);
    return null;
  }
}

/** Best-effort write, refreshed in lockstep with employes_cache (see
 * fetchEmployesFor) — never awaited by request handlers, so a caching
 * outage can't take down the app. */
export async function writePhotoPathsCache(tenantId: number, payload: Record<string, string>): Promise<void> {
  if (!sql) return;
  try {
    await ensureSchema();
    const json = JSON.stringify(payload);
    await sql`
      INSERT INTO photo_paths_cache (tenant_id, payload, updated_at)
      VALUES (${tenantId}, ${json}::jsonb, now())
      ON CONFLICT (tenant_id)
      DO UPDATE SET payload = ${json}::jsonb, updated_at = now()
    `;
  } catch (err) {
    console.error("[db] writePhotoPathsCache failed", err);
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
// Modelled directly on Ornella's own fiches d'objectifs (pondération as a
// percentage per ligne, objectifs 80% + soft skills 20%, score atteint saisi
// en %, contribution = pondération × score atteint) rather than the earlier
// coarse 4-niveau/points system.
//
// Lifecycle of one fiche (one employee x one année):
//   brouillon  -> the manager is drafting objectifs/soft skills, invisible to the employee
//   confirmee  -> objectifs confirmed: emailed to the employee (RH cc'd) and
//                 visible in their own espace — WITHOUT pondération/scores
//   auto_eval  -> the employee has submitted their self-assessment (only
//                 possible once an évaluation campagne covering them is
//                 "ouverte" — see evaluation_campagnes below)
//   terminee   -> the manager has completed the notation (final score set)
// `periode` (DB column) holds the année ("2026"), `evaluateur` holds the
// responsable's display name — kept under their original column names to
// avoid a migration, since both mean the same thing conceptually.

export const EVALUATION_STATUTS = ["brouillon", "confirmee", "auto_eval", "terminee"] as const;
export type EvaluationStatut = (typeof EVALUATION_STATUTS)[number];

export const STATUT_SUIVI = ["non_demarre", "en_cours", "en_attente", "a_valider", "termine", "bloque"] as const;
export type StatutSuivi = (typeof STATUT_SUIVI)[number];

export const NIVEAU_ATTENDU = ["initie", "autonome", "avance", "expert"] as const;
export type NiveauAttendu = (typeof NIVEAU_ATTENDU)[number];

export const SATISFACTION_NIVEAUX = ["tres_insatisfait", "insatisfait", "neutre", "satisfait", "tres_satisfait"] as const;
export type SatisfactionNiveau = (typeof SATISFACTION_NIVEAUX)[number];

/** Filled only by the employee, during auto-éval — purely informational
 * (never scored, never touched by the manager) — the "questions générales"
 * / environnement de travail block Ornella asked for, adapted from
 * Synelia's old semestrial auto-éval form. */
export interface QuestionsGenerales {
  relationsCollegues: SatisfactionNiveau | null;
  communicationHierarchie: SatisfactionNiveau | null;
  satisfactionPoste: SatisfactionNiveau | null;
  equilibreVieProPerso: SatisfactionNiveau | null;
  epanouissement: SatisfactionNiveau | null;
  besoinsFormation: string | null;
  suggestions: string | null;
  autresCommentaires: string | null;
}

export interface ObjectifLigne {
  id: string;
  numero: number;
  axe: string;
  objectif: string;
  livrables: string;
  kpi: string;
  cible: string;
  echeance: string;
  ponderation: number; // percentage points, e.g. 14 = 14% — objectifs should total 80
  statutSuivi: StatutSuivi;
  autoScoreAtteint: number | null; // % self-assessed by the employee
  autoCommentaire: string | null;
  scoreAtteint: number | null; // % assessed by the manager (final)
  managerCommentaire: string | null;
}

export interface SoftSkillLigne {
  id: string;
  critereId: string | null; // links back to evaluation_criteres_softskills, if picked from the référentiel
  libelle: string;
  description: string;
  niveauAttendu: NiveauAttendu;
  ponderation: number; // percentage points — soft skills should total 20
  autoScoreAtteint: number | null;
  autoCommentaire: string | null;
  scoreAtteint: number | null;
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
  softSkills: SoftSkillLigne[];
  commentaireManager: string | null;
  scoreGlobal: number | null; // percentage — sum of (ponderation × scoreAtteint / 100)
  campagneId: string | null; // set once auto-éval/notation actually happens under a campagne
  estTest: boolean; // flagged "FICHE TEST" — a pilot fiche, kept visually distinct from real ones
  questionsGenerales: QuestionsGenerales | null; // employee-only, informational, set at auto-éval
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
      .then(() => sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS soft_skills JSONB NOT NULL DEFAULT '[]'::jsonb`)
      .then(() => sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS campagne_id TEXT`)
      .then(() => sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS est_test BOOLEAN NOT NULL DEFAULT false`)
      .then(() => sql`ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS questions_generales JSONB`)
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
    softSkills: (row.soft_skills as SoftSkillLigne[]) ?? [],
    commentaireManager: (row.commentaire as string) ?? null,
    scoreGlobal: row.score === null ? null : Number(row.score),
    campagneId: (row.campagne_id as string) ?? null,
    estTest: Boolean(row.est_test),
    questionsGenerales: (row.questions_generales as QuestionsGenerales) ?? null,
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

export interface NouvelleFicheObjectifs {
  poste: string;
  departement: string;
  objectifs: Omit<ObjectifLigne, "autoScoreAtteint" | "autoCommentaire" | "scoreAtteint" | "managerCommentaire">[];
  softSkills: Omit<SoftSkillLigne, "autoScoreAtteint" | "autoCommentaire" | "scoreAtteint" | "managerCommentaire">[];
}

/** Creates one brouillon fiche per employee in `employeIds`, all seeded from
 * the same template — this is how a "modèle d'objectifs transverse" shared
 * by several collaborateurs works: the manager fills it once, each person
 * gets their own independent fiche (own scores/commentaires/statut) built
 * from identical objectifs/soft skills to start with. */
export async function createEvaluations(
  tenantId: number,
  employes: { id: number; nom: string; poste: string; departement: string }[],
  data: {
    responsableId: number | null;
    responsableNom: string;
    annee: string;
    objectifs: NouvelleFicheObjectifs["objectifs"];
    softSkills: NouvelleFicheObjectifs["softSkills"];
    estTest?: boolean;
  }
): Promise<Evaluation[]> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureEvaluationsSchema();
  const results: Evaluation[] = [];
  for (const employe of employes) {
    const id = crypto.randomUUID();
    const objectifs: ObjectifLigne[] = data.objectifs.map((o) => ({
      ...o,
      id: crypto.randomUUID(),
      autoScoreAtteint: null,
      autoCommentaire: null,
      scoreAtteint: null,
      managerCommentaire: null,
    }));
    const softSkills: SoftSkillLigne[] = data.softSkills.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      autoScoreAtteint: null,
      autoCommentaire: null,
      scoreAtteint: null,
      managerCommentaire: null,
    }));
    const rows = await sql`
      INSERT INTO evaluations
        (id, tenant_id, employe_id, employe_nom, poste, departement, responsable_id, evaluateur, periode, statut, objectifs, soft_skills, est_test)
      VALUES (
        ${id}, ${tenantId}, ${employe.id}, ${employe.nom}, ${employe.poste},
        ${employe.departement}, ${data.responsableId}, ${data.responsableNom}, ${data.annee}, 'brouillon',
        ${JSON.stringify(objectifs)}::jsonb, ${JSON.stringify(softSkills)}::jsonb, ${data.estTest ?? false}
      )
      RETURNING *
    `;
    results.push(rowToEvaluation(rows[0]));
  }
  return results;
}

/** Manager/RH editing objectif/soft-skill lines while the fiche is still a
 * brouillon — returns null once it's been confirmée (past that point, the
 * content is frozen; only auto-éval/notation touch the score fields). */
export async function setEvaluationContenu(
  tenantId: number,
  id: string,
  data: { poste: string; departement: string; objectifs: ObjectifLigne[]; softSkills: SoftSkillLigne[] }
): Promise<Evaluation | null> {
  if (!sql) return null;
  await ensureEvaluationsSchema();
  const rows = await sql`
    UPDATE evaluations SET
      poste = ${data.poste},
      departement = ${data.departement},
      objectifs = ${JSON.stringify(data.objectifs)}::jsonb,
      soft_skills = ${JSON.stringify(data.softSkills)}::jsonb,
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId} AND statut = 'brouillon'
    RETURNING *
  `;
  return rows[0] ? rowToEvaluation(rows[0]) : null;
}

/** brouillon -> confirmée. Caller (the API route) is responsible for
 * validating the pondération total and for sending the confirmation email
 * — this just flips the statut so it becomes visible in the collaborateur's
 * own espace. */
export async function confirmerEvaluation(tenantId: number, id: string): Promise<Evaluation | null> {
  if (!sql) return null;
  await ensureEvaluationsSchema();
  const rows = await sql`
    UPDATE evaluations SET statut = 'confirmee', updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId} AND statut = 'brouillon'
    RETURNING *
  `;
  return rows[0] ? rowToEvaluation(rows[0]) : null;
}

/** Manager updates the ongoing follow-up statut of one objectif — allowed
 * any time after confirmation (this is year-round progress tracking, not
 * gated by an évaluation campagne). */
export async function setObjectifStatutSuivi(
  tenantId: number,
  id: string,
  objectifId: string,
  statutSuivi: StatutSuivi
): Promise<Evaluation | null> {
  if (!sql) return null;
  await ensureEvaluationsSchema();
  const current = await sql`
    SELECT * FROM evaluations WHERE id = ${id} AND tenant_id = ${tenantId} AND statut != 'brouillon'
  `;
  if (current.length === 0) return null;
  const e = rowToEvaluation(current[0]);
  const objectifs = e.objectifs.map((o) => (o.id === objectifId ? { ...o, statutSuivi } : o));
  const rows = await sql`
    UPDATE evaluations SET objectifs = ${JSON.stringify(objectifs)}::jsonb, updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return rowToEvaluation(rows[0]);
}

/** Employee self-assessment — only possible while an évaluation campagne
 * covering their département/année is "ouverte" (checked live against
 * evaluation_campagnes, not cached on the fiche). */
export async function submitAutoEval(
  tenantId: number,
  id: string,
  data: {
    objectifs: { id: string; autoScoreAtteint: number | null; autoCommentaire: string | null }[];
    softSkills: { id: string; autoScoreAtteint: number | null; autoCommentaire: string | null }[];
    questionsGenerales?: QuestionsGenerales | null;
  }
): Promise<Evaluation | null> {
  if (!sql) return null;
  await ensureEvaluationsSchema();
  const current = await sql`
    SELECT e.* FROM evaluations e
    WHERE e.id = ${id} AND e.tenant_id = ${tenantId} AND e.statut IN ('confirmee', 'auto_eval')
      AND EXISTS (
        SELECT 1 FROM evaluation_campagnes c
        WHERE c.tenant_id = ${tenantId} AND c.annee = e.periode AND c.statut = 'ouverte'
          AND (c.entites = '[]'::jsonb OR c.entites @> to_jsonb(e.departement))
      )
  `;
  if (current.length === 0) return null;
  const e = rowToEvaluation(current[0]);
  const openCampagne = await sql`
    SELECT id FROM evaluation_campagnes
    WHERE tenant_id = ${tenantId} AND annee = ${e.annee} AND statut = 'ouverte'
      AND (entites = '[]'::jsonb OR entites @> to_jsonb(${e.departement}::text))
    LIMIT 1
  `;
  const objMap = new Map(data.objectifs.map((p) => [p.id, p]));
  const softMap = new Map(data.softSkills.map((p) => [p.id, p]));
  const objectifs = e.objectifs.map((o) => {
    const p = objMap.get(o.id);
    return p ? { ...o, autoScoreAtteint: p.autoScoreAtteint, autoCommentaire: p.autoCommentaire } : o;
  });
  const softSkills = e.softSkills.map((s) => {
    const p = softMap.get(s.id);
    return p ? { ...s, autoScoreAtteint: p.autoScoreAtteint, autoCommentaire: p.autoCommentaire } : s;
  });
  const questionsGenerales =
    data.questionsGenerales !== undefined ? data.questionsGenerales : e.questionsGenerales;
  const rows = await sql`
    UPDATE evaluations SET
      objectifs = ${JSON.stringify(objectifs)}::jsonb,
      soft_skills = ${JSON.stringify(softSkills)}::jsonb,
      questions_generales = ${questionsGenerales ? JSON.stringify(questionsGenerales) : null}::jsonb,
      statut = 'auto_eval',
      campagne_id = COALESCE(campagne_id, ${openCampagne[0]?.id ?? null}),
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return rowToEvaluation(rows[0]);
}

/** Manager notation — same campagne-ouverte gate as the auto-éval. Computes
 * the score global as Σ(pondération × scoreAtteint / 100) across objectifs
 * and soft skills, which lands on a 0-100 scale (over 100 if some lines
 * were entered above 100%, i.e. dépassement). */
export async function submitNotation(
  tenantId: number,
  id: string,
  data: {
    objectifs: { id: string; scoreAtteint: number | null; managerCommentaire: string | null }[];
    softSkills: { id: string; scoreAtteint: number | null; managerCommentaire: string | null }[];
    commentaireManager: string | null;
  }
): Promise<Evaluation | null> {
  if (!sql) return null;
  await ensureEvaluationsSchema();
  const current = await sql`
    SELECT e.* FROM evaluations e
    WHERE e.id = ${id} AND e.tenant_id = ${tenantId} AND e.statut IN ('confirmee', 'auto_eval')
      AND EXISTS (
        SELECT 1 FROM evaluation_campagnes c
        WHERE c.tenant_id = ${tenantId} AND c.annee = e.periode AND c.statut = 'ouverte'
          AND (c.entites = '[]'::jsonb OR c.entites @> to_jsonb(e.departement))
      )
  `;
  if (current.length === 0) return null;
  const e = rowToEvaluation(current[0]);
  const openCampagne = await sql`
    SELECT id FROM evaluation_campagnes
    WHERE tenant_id = ${tenantId} AND annee = ${e.annee} AND statut = 'ouverte'
      AND (entites = '[]'::jsonb OR entites @> to_jsonb(${e.departement}::text))
    LIMIT 1
  `;
  const objMap = new Map(data.objectifs.map((p) => [p.id, p]));
  const softMap = new Map(data.softSkills.map((p) => [p.id, p]));
  const objectifs = e.objectifs.map((o) => {
    const p = objMap.get(o.id);
    return p ? { ...o, scoreAtteint: p.scoreAtteint, managerCommentaire: p.managerCommentaire } : o;
  });
  const softSkills = e.softSkills.map((s) => {
    const p = softMap.get(s.id);
    return p ? { ...s, scoreAtteint: p.scoreAtteint, managerCommentaire: p.managerCommentaire } : s;
  });
  const scoreGlobal = [...objectifs, ...softSkills].reduce(
    (sum, l) => sum + (l.scoreAtteint != null ? (l.ponderation * l.scoreAtteint) / 100 : 0),
    0
  );
  const rows = await sql`
    UPDATE evaluations SET
      objectifs = ${JSON.stringify(objectifs)}::jsonb,
      soft_skills = ${JSON.stringify(softSkills)}::jsonb,
      commentaire = ${data.commentaireManager},
      score = ${Math.round(scoreGlobal * 10) / 10},
      statut = 'terminee',
      campagne_id = COALESCE(campagne_id, ${openCampagne[0]?.id ?? null}),
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

// ---------- référentiel de critères soft skills ----------
// A shared catalogue RH maintains (libellé + description + niveau/profil
// visé) — managers pick from it when building a fiche rather than
// retyping the same behavioural descriptions every time. `profil` is a
// free-text tag ("tous", "technique", …) used to suggest the right subset
// for a given collaborateur.

export interface CritereSoftSkill {
  id: string;
  tenantId: number;
  libelle: string;
  description: string;
  profil: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_CRITERES_SOFTSKILLS: { libelle: string; description: string; profil: string }[] = [
  {
    libelle: "Rigueur et fiabilité",
    description: "Produit un travail fiable, vérifie ses livrables et respecte les règles de confidentialité.",
    profil: "tous",
  },
  {
    libelle: "Organisation et gestion des priorités",
    description: "Planifie ses activités, respecte les échéances et alerte en cas de blocage.",
    profil: "tous",
  },
  {
    libelle: "Communication professionnelle",
    description: "Communique clairement avec les collaborateurs, managers et membres de l'équipe.",
    profil: "tous",
  },
  {
    libelle: "Esprit d'équipe et collaboration",
    description: "Partage l'information, contribue à la continuité de service et travaille en appui des autres périmètres.",
    profil: "tous",
  },
  {
    libelle: "Proactivité et amélioration continue",
    description: "Identifie les axes d'amélioration, propose des solutions et contribue à leur mise en œuvre.",
    profil: "tous",
  },
  {
    libelle: "Sens du service",
    description: "Apporte des réponses adaptées aux besoins des collaborateurs et managers, avec réactivité et professionnalisme.",
    profil: "tous",
  },
  {
    libelle: "Reporting des activités",
    description: "Rend compte régulièrement et clairement de l'avancement de ses tâches, tickets et livrables (points d'étape, blocages, délais).",
    profil: "technique",
  },
];

let criteresSoftSkillsSchemaReady: Promise<void> | null = null;

function ensureCriteresSoftSkillsSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!criteresSoftSkillsSchemaReady) {
    criteresSoftSkillsSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS evaluation_criteres_softskills (
        id TEXT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        libelle TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        profil TEXT NOT NULL DEFAULT 'tous',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
      .then(() => sql`CREATE INDEX IF NOT EXISTS eval_criteres_tenant_idx ON evaluation_criteres_softskills (tenant_id)`)
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure evaluation_criteres_softskills schema", err);
      });
  }
  return criteresSoftSkillsSchemaReady;
}

function rowToCritere(row: Record<string, unknown>): CritereSoftSkill {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    libelle: row.libelle as string,
    description: row.description as string,
    profil: row.profil as string,
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

/** Lazily seeds a tenant's référentiel with the default catalogue the first
 * time it's read — so RH starts from something useful instead of a blank
 * list, but can freely edit/delete/add from there. */
export async function listCriteresSoftSkills(tenantId: number): Promise<CritereSoftSkill[]> {
  if (!sql) return [];
  await ensureCriteresSoftSkillsSchema();
  const existing = await sql`SELECT * FROM evaluation_criteres_softskills WHERE tenant_id = ${tenantId}`;
  if (existing.length === 0) {
    for (const c of DEFAULT_CRITERES_SOFTSKILLS) {
      await sql`
        INSERT INTO evaluation_criteres_softskills (id, tenant_id, libelle, description, profil)
        VALUES (${crypto.randomUUID()}, ${tenantId}, ${c.libelle}, ${c.description}, ${c.profil})
      `;
    }
    const seeded = await sql`
      SELECT * FROM evaluation_criteres_softskills WHERE tenant_id = ${tenantId} ORDER BY created_at
    `;
    return seeded.map(rowToCritere);
  }
  return existing
    .map(rowToCritere)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createCritereSoftSkill(
  tenantId: number,
  data: { libelle: string; description: string; profil: string }
): Promise<CritereSoftSkill> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureCriteresSoftSkillsSchema();
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO evaluation_criteres_softskills (id, tenant_id, libelle, description, profil)
    VALUES (${id}, ${tenantId}, ${data.libelle}, ${data.description}, ${data.profil})
    RETURNING *
  `;
  return rowToCritere(rows[0]);
}

export async function updateCritereSoftSkill(
  tenantId: number,
  id: string,
  patch: Partial<{ libelle: string; description: string; profil: string }>
): Promise<CritereSoftSkill | null> {
  if (!sql) return null;
  await ensureCriteresSoftSkillsSchema();
  const current = await sql`SELECT * FROM evaluation_criteres_softskills WHERE id = ${id} AND tenant_id = ${tenantId}`;
  if (current.length === 0) return null;
  const c = rowToCritere(current[0]);
  const merged = { ...c, ...patch };
  const rows = await sql`
    UPDATE evaluation_criteres_softskills SET
      libelle = ${merged.libelle}, description = ${merged.description}, profil = ${merged.profil}, updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return rowToCritere(rows[0]);
}

export async function deleteCritereSoftSkill(tenantId: number, id: string): Promise<void> {
  if (!sql) return;
  await ensureCriteresSoftSkillsSchema();
  await sql`DELETE FROM evaluation_criteres_softskills WHERE id = ${id} AND tenant_id = ${tenantId}`;
}

// ---------- campagnes d'évaluation ----------
// RH-controlled open/close window. Auto-éval and notation are only allowed
// on a fiche while a campagne exists covering its année and département
// (entites = [] means "toutes entités") with statut = 'ouverte' — checked
// live (see submitAutoEval/submitNotation above), not cached on the fiche.

export const CAMPAGNE_STATUTS = ["ouverte", "fermee"] as const;
export type CampagneStatut = (typeof CAMPAGNE_STATUTS)[number];

export interface Campagne {
  id: string;
  tenantId: number;
  nom: string;
  annee: string;
  entites: string[];
  statut: CampagneStatut;
  openedAt: string | null;
  closedAt: string | null;
  estTest: boolean;
  createdAt: string;
  updatedAt: string;
}

let campagnesSchemaReady: Promise<void> | null = null;

function ensureCampagnesSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!campagnesSchemaReady) {
    campagnesSchemaReady = sql`
      CREATE TABLE IF NOT EXISTS evaluation_campagnes (
        id TEXT PRIMARY KEY,
        tenant_id BIGINT NOT NULL,
        nom TEXT NOT NULL,
        annee TEXT NOT NULL,
        entites JSONB NOT NULL DEFAULT '[]'::jsonb,
        statut TEXT NOT NULL DEFAULT 'fermee',
        opened_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `
      .then(() => sql`ALTER TABLE evaluation_campagnes ADD COLUMN IF NOT EXISTS est_test BOOLEAN NOT NULL DEFAULT false`)
      .then(() => sql`CREATE INDEX IF NOT EXISTS eval_campagnes_tenant_idx ON evaluation_campagnes (tenant_id)`)
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure evaluation_campagnes schema", err);
      });
  }
  return campagnesSchemaReady;
}

function rowToCampagne(row: Record<string, unknown>): Campagne {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    nom: row.nom as string,
    annee: row.annee as string,
    entites: (row.entites as string[]) ?? [],
    statut: row.statut as CampagneStatut,
    openedAt: row.opened_at ? new Date(row.opened_at as string).toISOString() : null,
    closedAt: row.closed_at ? new Date(row.closed_at as string).toISOString() : null,
    estTest: Boolean(row.est_test),
    createdAt: new Date(row.created_at as string).toISOString(),
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

export async function listCampagnes(tenantId: number): Promise<Campagne[]> {
  if (!sql) return [];
  await ensureCampagnesSchema();
  const rows = await sql`SELECT * FROM evaluation_campagnes WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
  return rows.map(rowToCampagne);
}

export async function createCampagne(
  tenantId: number,
  data: { nom: string; annee: string; entites: string[]; estTest?: boolean }
): Promise<Campagne> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureCampagnesSchema();
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO evaluation_campagnes (id, tenant_id, nom, annee, entites, statut, est_test)
    VALUES (${id}, ${tenantId}, ${data.nom}, ${data.annee}, ${JSON.stringify(data.entites)}::jsonb, 'fermee', ${data.estTest ?? false})
    RETURNING *
  `;
  return rowToCampagne(rows[0]);
}

export async function setCampagneStatut(
  tenantId: number,
  id: string,
  statut: CampagneStatut
): Promise<Campagne | null> {
  if (!sql) return null;
  await ensureCampagnesSchema();
  const rows = await sql`
    UPDATE evaluation_campagnes SET
      statut = ${statut},
      opened_at = CASE WHEN ${statut} = 'ouverte' AND opened_at IS NULL THEN now() ELSE opened_at END,
      closed_at = CASE WHEN ${statut} = 'fermee' THEN now() ELSE closed_at END,
      updated_at = now()
    WHERE id = ${id} AND tenant_id = ${tenantId}
    RETURNING *
  `;
  return rows[0] ? rowToCampagne(rows[0]) : null;
}

/** Mirrors the live EXISTS check in submitAutoEval/submitNotation, for
 * callers (pages) that need to know upfront whether to show the auto-éval/
 * notation UI at all rather than let the user hit a 409. */
export function isCampagneOuvertePour(campagnes: Campagne[], annee: string, departement: string): boolean {
  return campagnes.some(
    (c) => c.statut === "ouverte" && c.annee === annee && (c.entites.length === 0 || c.entites.includes(departement))
  );
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

// ============================================================================
// GPEC (Gestion Prévisionnelle des Emplois et des Compétences)
// ============================================================================
// Deliberately independent of the Évaluations module above: own tables, own
// campagnes, no FK to evaluations/evaluation_campagnes. Évaluations measures
// atteinte d'objectifs sur une période ; GPEC measures niveau de maîtrise
// d'une compétence vs un référentiel métier — different data, different
// screens, no fusion. A rapprochement is only ever discussed for a future
// iteration (not before next year) and isn't built here.
//
// RattachementManager is its own table on purpose: Neos' contract
// "Responsable" field is the signataire contractuel, not real day-to-day
// management (1 "responsable" is attached to 180 of 231 people) — so
// gpec_personne.manager_id is a denormalized *cache* of the current
// (date_fin IS NULL) row in gpec_rattachement_manager, always re-derived
// from it, never the other way around, and manager-facing queries
// (listGpecPersonnesManagedBy) hit gpec_rattachement_manager directly rather
// than trusting the cache.

export const GPEC_COMPETENCE_CATEGORIES = ["Savoir", "Savoir-faire", "Savoir-être"] as const;
export type GpecCompetenceCategorie = (typeof GPEC_COMPETENCE_CATEGORIES)[number];

export const GPEC_CAMPAGNE_STATUTS = ["ouverte", "cloturee"] as const;
export type GpecCampagneStatut = (typeof GPEC_CAMPAGNE_STATUTS)[number];

export interface GpecFamille {
  id: string;
  tenantId: number;
  nom: string;
  ordre: number;
}

export interface GpecEmploiType {
  id: string;
  tenantId: number;
  familleId: string;
  nom: string;
  ordre: number;
  effectifReference: number | null;
}

export interface GpecCompetenceSocle {
  id: string;
  tenantId: number;
  nom: string;
  defNiveau1: string;
  defNiveau2: string;
  defNiveau3: string;
  defNiveau4: string;
}

export interface GpecCompetence {
  id: string;
  tenantId: number;
  emploiTypeId: string;
  categorie: GpecCompetenceCategorie;
  libelle: string;
  niveauRequis: number;
  competenceSocleId: string | null;
}

export interface GpecEchelleNiveau {
  tenantId: number;
  niveau: number;
  libelle: string;
  definition: string;
}

export interface GpecPersonne {
  id: string;
  tenantId: number;
  matricule: string;
  nom: string;
  prenoms: string;
  entite: string;
  email: string | null;
  fonctionContrat: string;
  emploiTypeId: string | null;
  managerId: string | null; // cache — see header comment
  actif: boolean;
  employeId: number | null; // matched live Neos employee, for session-based access
}

export interface GpecRattachementManager {
  id: string;
  tenantId: number;
  personneId: string;
  managerId: string;
  dateDebut: string;
  dateFin: string | null;
}

export interface GpecCampagne {
  id: string;
  tenantId: number;
  nom: string;
  dateDebut: string;
  dateFin: string;
  statut: GpecCampagneStatut;
  createdAt: string;
}

export interface GpecEvaluation {
  id: string;
  tenantId: number;
  campagneId: string;
  personneId: string;
  competenceId: string;
  niveauAuto: number | null;
  niveauManager: number | null;
  niveauRetenu: number | null;
  commentaire: string | null;
  dateAuto: string | null;
  dateManager: string | null;
  evaluePar_id: string | null;
}

/** RH-granted, nominative, time-boundable exception letting a specific Neos
 * user (not necessarily ROLE_SG) see per-person GPEC detail on the
 * dashboards rather than only the aggregated group figures — see role table
 * in the cahier des charges ("Tableaux de bord agrégés uniquement ... sauf
 * accès RH explicite"). One row per grantee; re-granting extends/edits it. */
export interface GpecDirectionAccess {
  tenantId: number;
  employeId: number;
  grantedByEmployeId: number;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
}

let gpecSchemaReady: Promise<void> | null = null;

function ensureGpecSchema(): Promise<void> {
  if (!sql) return Promise.resolve();
  if (!gpecSchemaReady) {
    // Sequential .then() chain, not Promise.all: several statements below
    // (the CREATE INDEXes, gpec_competence referencing gpec_emploi_type)
    // depend on an earlier CREATE TABLE having already committed, and neon's
    // serverless driver gives no ordering guarantee across concurrently
    // fired queries — a race here intermittently fails with "relation ...
    // does not exist" (caught the hard way while testing this module).
    gpecSchemaReady = Promise.resolve()
      .then(
        () => sql`
          CREATE TABLE IF NOT EXISTS gpec_famille (
            id TEXT PRIMARY KEY,
            tenant_id BIGINT NOT NULL,
            nom TEXT NOT NULL,
            ordre INTEGER NOT NULL DEFAULT 0,
            UNIQUE (tenant_id, nom)
          )
        `
      )
      .then(
        () => sql`
          CREATE TABLE IF NOT EXISTS gpec_emploi_type (
            id TEXT PRIMARY KEY,
            tenant_id BIGINT NOT NULL,
            famille_id TEXT NOT NULL,
            nom TEXT NOT NULL,
            ordre INTEGER NOT NULL DEFAULT 0,
            effectif_reference INTEGER,
            UNIQUE (tenant_id, nom)
          )
        `
      )
      .then(
        () => sql`
          CREATE TABLE IF NOT EXISTS gpec_competence_socle (
            id TEXT PRIMARY KEY,
            tenant_id BIGINT NOT NULL,
            nom TEXT NOT NULL,
            def_niveau_1 TEXT NOT NULL DEFAULT '',
            def_niveau_2 TEXT NOT NULL DEFAULT '',
            def_niveau_3 TEXT NOT NULL DEFAULT '',
            def_niveau_4 TEXT NOT NULL DEFAULT '',
            UNIQUE (tenant_id, nom)
          )
        `
      )
      .then(
        () => sql`
          CREATE TABLE IF NOT EXISTS gpec_competence (
            id TEXT PRIMARY KEY,
            tenant_id BIGINT NOT NULL,
            emploi_type_id TEXT NOT NULL,
            categorie TEXT NOT NULL,
            libelle TEXT NOT NULL,
            niveau_requis INTEGER NOT NULL,
            competence_socle_id TEXT,
            UNIQUE (tenant_id, emploi_type_id, libelle)
          )
        `
      )
      .then(
        () => sql`
          CREATE TABLE IF NOT EXISTS gpec_echelle_niveau (
            tenant_id BIGINT NOT NULL,
            niveau INTEGER NOT NULL,
            libelle TEXT NOT NULL,
            definition TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (tenant_id, niveau)
          )
        `
      )
      .then(
        () => sql`
          CREATE TABLE IF NOT EXISTS gpec_personne (
            id TEXT PRIMARY KEY,
            tenant_id BIGINT NOT NULL,
            matricule TEXT NOT NULL,
            nom TEXT NOT NULL,
            prenoms TEXT NOT NULL,
            entite TEXT NOT NULL DEFAULT '',
            email TEXT,
            fonction_contrat TEXT NOT NULL DEFAULT '',
            emploi_type_id TEXT,
            manager_id TEXT,
            actif BOOLEAN NOT NULL DEFAULT true,
            employe_id BIGINT,
            UNIQUE (tenant_id, matricule)
          )
        `
      )
      .then(
        () => sql`
          CREATE TABLE IF NOT EXISTS gpec_rattachement_manager (
            id TEXT PRIMARY KEY,
            tenant_id BIGINT NOT NULL,
            personne_id TEXT NOT NULL,
            manager_id TEXT NOT NULL,
            date_debut TIMESTAMPTZ NOT NULL DEFAULT now(),
            date_fin TIMESTAMPTZ
          )
        `
      )
      .then(
        () => sql`
          CREATE TABLE IF NOT EXISTS gpec_campagne (
            id TEXT PRIMARY KEY,
            tenant_id BIGINT NOT NULL,
            nom TEXT NOT NULL,
            date_debut TEXT NOT NULL,
            date_fin TEXT NOT NULL,
            statut TEXT NOT NULL DEFAULT 'ouverte',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `
      )
      .then(
        () => sql`
          CREATE TABLE IF NOT EXISTS gpec_evaluation (
            id TEXT PRIMARY KEY,
            tenant_id BIGINT NOT NULL,
            campagne_id TEXT NOT NULL,
            personne_id TEXT NOT NULL,
            competence_id TEXT NOT NULL,
            niveau_auto INTEGER,
            niveau_manager INTEGER,
            niveau_retenu INTEGER,
            commentaire TEXT,
            date_auto TIMESTAMPTZ,
            date_manager TIMESTAMPTZ,
            evalue_par_id TEXT,
            UNIQUE (tenant_id, campagne_id, personne_id, competence_id)
          )
        `
      )
      .then(
        () => sql`
          CREATE TABLE IF NOT EXISTS gpec_direction_access (
            tenant_id BIGINT NOT NULL,
            employe_id BIGINT NOT NULL,
            granted_by_employe_id BIGINT NOT NULL,
            note TEXT,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (tenant_id, employe_id)
          )
        `
      )
      .then(() => sql`CREATE INDEX IF NOT EXISTS gpec_emploi_type_famille_idx ON gpec_emploi_type (tenant_id, famille_id)`)
      .then(() => sql`CREATE INDEX IF NOT EXISTS gpec_competence_emploi_type_idx ON gpec_competence (tenant_id, emploi_type_id)`)
      .then(() => sql`CREATE INDEX IF NOT EXISTS gpec_personne_emploi_type_idx ON gpec_personne (tenant_id, emploi_type_id)`)
      .then(() => sql`CREATE INDEX IF NOT EXISTS gpec_personne_employe_idx ON gpec_personne (tenant_id, employe_id)`)
      .then(() => sql`CREATE INDEX IF NOT EXISTS gpec_rattachement_personne_idx ON gpec_rattachement_manager (tenant_id, personne_id, date_fin)`)
      .then(() => sql`CREATE INDEX IF NOT EXISTS gpec_rattachement_manager_idx ON gpec_rattachement_manager (tenant_id, manager_id, date_fin)`)
      .then(() => sql`CREATE INDEX IF NOT EXISTS gpec_evaluation_campagne_idx ON gpec_evaluation (tenant_id, campagne_id)`)
      .then(() => sql`CREATE INDEX IF NOT EXISTS gpec_evaluation_personne_idx ON gpec_evaluation (tenant_id, personne_id)`)
      .then(() => undefined)
      .catch((err) => {
        console.error("[db] failed to ensure gpec schema", err);
      });
  }
  return gpecSchemaReady;
}

function rowToGpecFamille(row: Record<string, unknown>): GpecFamille {
  return { id: row.id as string, tenantId: Number(row.tenant_id), nom: row.nom as string, ordre: Number(row.ordre) };
}

function rowToGpecEmploiType(row: Record<string, unknown>): GpecEmploiType {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    familleId: row.famille_id as string,
    nom: row.nom as string,
    ordre: Number(row.ordre),
    effectifReference: row.effectif_reference != null ? Number(row.effectif_reference) : null,
  };
}

function rowToGpecCompetenceSocle(row: Record<string, unknown>): GpecCompetenceSocle {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    nom: row.nom as string,
    defNiveau1: row.def_niveau_1 as string,
    defNiveau2: row.def_niveau_2 as string,
    defNiveau3: row.def_niveau_3 as string,
    defNiveau4: row.def_niveau_4 as string,
  };
}

function rowToGpecCompetence(row: Record<string, unknown>): GpecCompetence {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    emploiTypeId: row.emploi_type_id as string,
    categorie: row.categorie as GpecCompetenceCategorie,
    libelle: row.libelle as string,
    niveauRequis: Number(row.niveau_requis),
    competenceSocleId: (row.competence_socle_id as string) ?? null,
  };
}

function rowToGpecPersonne(row: Record<string, unknown>): GpecPersonne {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    matricule: row.matricule as string,
    nom: row.nom as string,
    prenoms: row.prenoms as string,
    entite: row.entite as string,
    email: (row.email as string) ?? null,
    fonctionContrat: row.fonction_contrat as string,
    emploiTypeId: (row.emploi_type_id as string) ?? null,
    managerId: (row.manager_id as string) ?? null,
    actif: Boolean(row.actif),
    employeId: row.employe_id != null ? Number(row.employe_id) : null,
  };
}

export function rowToGpecRattachement(row: Record<string, unknown>): GpecRattachementManager {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    personneId: row.personne_id as string,
    managerId: row.manager_id as string,
    dateDebut: new Date(row.date_debut as string).toISOString(),
    dateFin: row.date_fin ? new Date(row.date_fin as string).toISOString() : null,
  };
}

function rowToGpecCampagne(row: Record<string, unknown>): GpecCampagne {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    nom: row.nom as string,
    dateDebut: row.date_debut as string,
    dateFin: row.date_fin as string,
    statut: row.statut as GpecCampagneStatut,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function rowToGpecEvaluation(row: Record<string, unknown>): GpecEvaluation {
  return {
    id: row.id as string,
    tenantId: Number(row.tenant_id),
    campagneId: row.campagne_id as string,
    personneId: row.personne_id as string,
    competenceId: row.competence_id as string,
    niveauAuto: row.niveau_auto != null ? Number(row.niveau_auto) : null,
    niveauManager: row.niveau_manager != null ? Number(row.niveau_manager) : null,
    niveauRetenu: row.niveau_retenu != null ? Number(row.niveau_retenu) : null,
    commentaire: (row.commentaire as string) ?? null,
    dateAuto: row.date_auto ? new Date(row.date_auto as string).toISOString() : null,
    dateManager: row.date_manager ? new Date(row.date_manager as string).toISOString() : null,
    evaluePar_id: (row.evalue_par_id as string) ?? null,
  };
}

// ---- Référentiels (Famille / EmploiType / CompetenceSocle / Competence / EchelleNiveau) ----

export async function listGpecFamilles(tenantId: number): Promise<GpecFamille[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_famille WHERE tenant_id = ${tenantId} ORDER BY ordre`;
  return rows.map(rowToGpecFamille);
}

/** Import-time upsert, keyed by name — safe to re-run the same import. */
export async function getOrCreateGpecFamille(tenantId: number, nom: string, ordre: number): Promise<GpecFamille> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureGpecSchema();
  const rows = await sql`
    INSERT INTO gpec_famille (id, tenant_id, nom, ordre)
    VALUES (${crypto.randomUUID()}, ${tenantId}, ${nom}, ${ordre})
    ON CONFLICT (tenant_id, nom) DO UPDATE SET ordre = ${ordre}
    RETURNING *
  `;
  return rowToGpecFamille(rows[0]);
}

export async function listGpecEmploiTypes(tenantId: number): Promise<GpecEmploiType[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_emploi_type WHERE tenant_id = ${tenantId} ORDER BY ordre`;
  return rows.map(rowToGpecEmploiType);
}

export async function getOrCreateGpecEmploiType(
  tenantId: number,
  familleId: string,
  nom: string,
  ordre: number,
  effectifReference: number | null
): Promise<GpecEmploiType> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureGpecSchema();
  const rows = await sql`
    INSERT INTO gpec_emploi_type (id, tenant_id, famille_id, nom, ordre, effectif_reference)
    VALUES (${crypto.randomUUID()}, ${tenantId}, ${familleId}, ${nom}, ${ordre}, ${effectifReference})
    ON CONFLICT (tenant_id, nom) DO UPDATE SET
      famille_id = ${familleId}, ordre = ${ordre}, effectif_reference = ${effectifReference}
    RETURNING *
  `;
  return rowToGpecEmploiType(rows[0]);
}

export async function listGpecCompetenceSocles(tenantId: number): Promise<GpecCompetenceSocle[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_competence_socle WHERE tenant_id = ${tenantId} ORDER BY nom`;
  return rows.map(rowToGpecCompetenceSocle);
}

export async function getOrCreateGpecCompetenceSocle(
  tenantId: number,
  nom: string,
  defs: { defNiveau1: string; defNiveau2: string; defNiveau3: string; defNiveau4: string }
): Promise<GpecCompetenceSocle> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureGpecSchema();
  const rows = await sql`
    INSERT INTO gpec_competence_socle (id, tenant_id, nom, def_niveau_1, def_niveau_2, def_niveau_3, def_niveau_4)
    VALUES (${crypto.randomUUID()}, ${tenantId}, ${nom}, ${defs.defNiveau1}, ${defs.defNiveau2}, ${defs.defNiveau3}, ${defs.defNiveau4})
    ON CONFLICT (tenant_id, nom) DO UPDATE SET
      def_niveau_1 = ${defs.defNiveau1}, def_niveau_2 = ${defs.defNiveau2},
      def_niveau_3 = ${defs.defNiveau3}, def_niveau_4 = ${defs.defNiveau4}
    RETURNING *
  `;
  return rowToGpecCompetenceSocle(rows[0]);
}

export async function listGpecCompetences(tenantId: number): Promise<GpecCompetence[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_competence WHERE tenant_id = ${tenantId} ORDER BY libelle`;
  return rows.map(rowToGpecCompetence);
}

export async function listGpecCompetencesForEmploiType(
  tenantId: number,
  emploiTypeId: string
): Promise<GpecCompetence[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`
    SELECT * FROM gpec_competence WHERE tenant_id = ${tenantId} AND emploi_type_id = ${emploiTypeId} ORDER BY categorie, libelle
  `;
  return rows.map(rowToGpecCompetence);
}

export async function getOrCreateGpecCompetence(
  tenantId: number,
  data: {
    emploiTypeId: string;
    categorie: GpecCompetenceCategorie;
    libelle: string;
    niveauRequis: number;
    competenceSocleId: string | null;
  }
): Promise<GpecCompetence> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureGpecSchema();
  const rows = await sql`
    INSERT INTO gpec_competence (id, tenant_id, emploi_type_id, categorie, libelle, niveau_requis, competence_socle_id)
    VALUES (${crypto.randomUUID()}, ${tenantId}, ${data.emploiTypeId}, ${data.categorie}, ${data.libelle}, ${data.niveauRequis}, ${data.competenceSocleId})
    ON CONFLICT (tenant_id, emploi_type_id, libelle) DO UPDATE SET
      categorie = ${data.categorie}, niveau_requis = ${data.niveauRequis}, competence_socle_id = ${data.competenceSocleId}
    RETURNING *
  `;
  return rowToGpecCompetence(rows[0]);
}

const GPEC_ECHELLE_DEFAUT: { niveau: number; libelle: string; definition: string }[] = [
  { niveau: 1, libelle: "Notions", definition: "Connaît les bases, a besoin d'accompagnement pour appliquer" },
  { niveau: 2, libelle: "Autonome", definition: "Maîtrise en autonomie les situations courantes" },
  { niveau: 3, libelle: "Confirmé", definition: "Maîtrise les situations complexes, peut conseiller les autres" },
  { niveau: 4, libelle: "Expert", definition: "Fait référence sur le sujet, forme et supervise les autres" },
];

/** Lazily seeds the 4-level échelle (identical across tenants per the CDC's
 * own référentiel) the first time it's read, exactly like
 * listCriteresSoftSkills seeds its default catalogue — import overwrites
 * these with the tenant's real file if it differs. */
export async function listGpecEchelleNiveaux(tenantId: number): Promise<GpecEchelleNiveau[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const existing = await sql`SELECT * FROM gpec_echelle_niveau WHERE tenant_id = ${tenantId} ORDER BY niveau`;
  if (existing.length === 0) {
    for (const n of GPEC_ECHELLE_DEFAUT) {
      await sql`
        INSERT INTO gpec_echelle_niveau (tenant_id, niveau, libelle, definition)
        VALUES (${tenantId}, ${n.niveau}, ${n.libelle}, ${n.definition})
        ON CONFLICT (tenant_id, niveau) DO NOTHING
      `;
    }
    const seeded = await sql`SELECT * FROM gpec_echelle_niveau WHERE tenant_id = ${tenantId} ORDER BY niveau`;
    return seeded.map((r) => ({ tenantId: Number(r.tenant_id), niveau: Number(r.niveau), libelle: r.libelle as string, definition: r.definition as string }));
  }
  return existing.map((r) => ({ tenantId: Number(r.tenant_id), niveau: Number(r.niveau), libelle: r.libelle as string, definition: r.definition as string }));
}

export async function setGpecEchelleNiveau(
  tenantId: number,
  niveau: number,
  libelle: string,
  definition: string
): Promise<void> {
  if (!sql) return;
  await ensureGpecSchema();
  await sql`
    INSERT INTO gpec_echelle_niveau (tenant_id, niveau, libelle, definition)
    VALUES (${tenantId}, ${niveau}, ${libelle}, ${definition})
    ON CONFLICT (tenant_id, niveau) DO UPDATE SET libelle = ${libelle}, definition = ${definition}
  `;
}

// ---- Personne / RattachementManager ----

export async function listGpecPersonnes(tenantId: number): Promise<GpecPersonne[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_personne WHERE tenant_id = ${tenantId} ORDER BY nom, prenoms`;
  return rows.map(rowToGpecPersonne);
}

export async function getGpecPersonne(tenantId: number, id: string): Promise<GpecPersonne | null> {
  if (!sql) return null;
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_personne WHERE tenant_id = ${tenantId} AND id = ${id}`;
  return rows.length ? rowToGpecPersonne(rows[0]) : null;
}

/** The GPEC record for the currently logged-in Neos user, if their
 * personne row was matched to them at import time. */
export async function getGpecPersonneByEmployeId(tenantId: number, employeId: number): Promise<GpecPersonne | null> {
  if (!sql) return null;
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_personne WHERE tenant_id = ${tenantId} AND employe_id = ${employeId}`;
  return rows.length ? rowToGpecPersonne(rows[0]) : null;
}

/** Import-time upsert, keyed by matricule — the one stable natural key this
 * source file carries (unlike the rest of this app, GPEC's own Personne
 * table doesn't need a Neos id to stay idempotent across re-imports). */
export async function upsertGpecPersonneByMatricule(
  tenantId: number,
  data: {
    matricule: string;
    nom: string;
    prenoms: string;
    entite: string;
    fonctionContrat: string;
    emploiTypeId: string | null;
    actif: boolean;
    employeId: number | null;
    email: string | null;
  }
): Promise<GpecPersonne> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureGpecSchema();
  const rows = await sql`
    INSERT INTO gpec_personne (id, tenant_id, matricule, nom, prenoms, entite, email, fonction_contrat, emploi_type_id, actif, employe_id)
    VALUES (
      ${crypto.randomUUID()}, ${tenantId}, ${data.matricule}, ${data.nom}, ${data.prenoms}, ${data.entite},
      ${data.email}, ${data.fonctionContrat}, ${data.emploiTypeId}, ${data.actif}, ${data.employeId}
    )
    ON CONFLICT (tenant_id, matricule) DO UPDATE SET
      nom = ${data.nom}, prenoms = ${data.prenoms}, entite = ${data.entite}, email = ${data.email},
      fonction_contrat = ${data.fonctionContrat}, emploi_type_id = ${data.emploiTypeId},
      actif = ${data.actif}, employe_id = ${data.employeId}
    RETURNING *
  `;
  return rowToGpecPersonne(rows[0]);
}

/** RH reassigning someone to a new EmploiType (Module 1: "modifiable
 * manuellement"). */
export async function setGpecPersonneEmploiType(
  tenantId: number,
  personneId: string,
  emploiTypeId: string | null
): Promise<GpecPersonne | null> {
  if (!sql) return null;
  await ensureGpecSchema();
  const rows = await sql`
    UPDATE gpec_personne SET emploi_type_id = ${emploiTypeId}
    WHERE tenant_id = ${tenantId} AND id = ${personneId}
    RETURNING *
  `;
  return rows.length ? rowToGpecPersonne(rows[0]) : null;
}

/** RH reassigning a collaborateur to a new manager: closes whatever
 * rattachement is currently open (date_fin IS NULL) and opens a new one,
 * then refreshes the manager_id cache on gpec_personne. Never touches
 * manager_overrides / Neos' contract "Responsable" field — see header. */
export async function setGpecManager(
  tenantId: number,
  personneId: string,
  managerId: string | null
): Promise<GpecPersonne | null> {
  if (!sql) return null;
  await ensureGpecSchema();
  await sql`
    UPDATE gpec_rattachement_manager SET date_fin = now()
    WHERE tenant_id = ${tenantId} AND personne_id = ${personneId} AND date_fin IS NULL
  `;
  if (managerId) {
    await sql`
      INSERT INTO gpec_rattachement_manager (id, tenant_id, personne_id, manager_id)
      VALUES (${crypto.randomUUID()}, ${tenantId}, ${personneId}, ${managerId})
    `;
  }
  const rows = await sql`
    UPDATE gpec_personne SET manager_id = ${managerId}
    WHERE tenant_id = ${tenantId} AND id = ${personneId}
    RETURNING *
  `;
  return rows.length ? rowToGpecPersonne(rows[0]) : null;
}

/** The people a manager actually manages, per RattachementManager — this is
 * the query Module 4 ("vue filtrée") and the permission checks on
 * évaluation writes must use; never gpec_personne.manager_id directly (that
 * column is only a display cache) and never Neos' own manager field. */
export async function listGpecPersonnesManagedBy(tenantId: number, managerPersonneId: string): Promise<GpecPersonne[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`
    SELECT p.* FROM gpec_personne p
    JOIN gpec_rattachement_manager r ON r.personne_id = p.id AND r.tenant_id = p.tenant_id
    WHERE p.tenant_id = ${tenantId} AND r.manager_id = ${managerPersonneId} AND r.date_fin IS NULL
    ORDER BY p.nom, p.prenoms
  `;
  return rows.map(rowToGpecPersonne);
}

/** Full rattachement history for one personne (past and current managers) —
 * "on ne réécrit jamais" a closed row, this is exactly what makes an audit
 * of "qui gérait qui, et depuis quand" possible. */
export async function listGpecRattachementHistory(tenantId: number, personneId: string): Promise<GpecRattachementManager[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`
    SELECT * FROM gpec_rattachement_manager WHERE tenant_id = ${tenantId} AND personne_id = ${personneId}
    ORDER BY date_debut DESC
  `;
  return rows.map(rowToGpecRattachement);
}

export async function isGpecManagerOf(tenantId: number, managerPersonneId: string, personneId: string): Promise<boolean> {
  if (!sql) return false;
  await ensureGpecSchema();
  const rows = await sql`
    SELECT 1 FROM gpec_rattachement_manager
    WHERE tenant_id = ${tenantId} AND manager_id = ${managerPersonneId} AND personne_id = ${personneId} AND date_fin IS NULL
  `;
  return rows.length > 0;
}

// ---- Campagnes / Evaluations ----

export async function listGpecCampagnes(tenantId: number): Promise<GpecCampagne[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_campagne WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
  return rows.map(rowToGpecCampagne);
}

export async function getGpecCampagne(tenantId: number, id: string): Promise<GpecCampagne | null> {
  if (!sql) return null;
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_campagne WHERE tenant_id = ${tenantId} AND id = ${id}`;
  return rows.length ? rowToGpecCampagne(rows[0]) : null;
}

export async function createGpecCampagne(
  tenantId: number,
  data: { nom: string; dateDebut: string; dateFin: string }
): Promise<GpecCampagne> {
  if (!sql) throw new Error("Base de données non configurée (DATABASE_URL manquant)");
  await ensureGpecSchema();
  const rows = await sql`
    INSERT INTO gpec_campagne (id, tenant_id, nom, date_debut, date_fin, statut)
    VALUES (${crypto.randomUUID()}, ${tenantId}, ${data.nom}, ${data.dateDebut}, ${data.dateFin}, 'ouverte')
    RETURNING *
  `;
  return rowToGpecCampagne(rows[0]);
}

export async function setGpecCampagneStatut(
  tenantId: number,
  id: string,
  statut: GpecCampagneStatut
): Promise<GpecCampagne | null> {
  if (!sql) return null;
  await ensureGpecSchema();
  const rows = await sql`
    UPDATE gpec_campagne SET statut = ${statut} WHERE tenant_id = ${tenantId} AND id = ${id} RETURNING *
  `;
  return rows.length ? rowToGpecCampagne(rows[0]) : null;
}

/** Empty Evaluation rows for one (personne × compétence de son emploi-type)
 * at campagne opening — idempotent (ON CONFLICT DO NOTHING) so re-running
 * générationEvaluations after adding a late-arriving personne never
 * duplicates or resets already-answered rows. */
export async function generateGpecEvaluations(
  tenantId: number,
  campagneId: string,
  pairs: { personneId: string; competenceId: string }[]
): Promise<number> {
  if (!sql || pairs.length === 0) return 0;
  await ensureGpecSchema();
  let created = 0;
  for (const p of pairs) {
    const rows = await sql`
      INSERT INTO gpec_evaluation (id, tenant_id, campagne_id, personne_id, competence_id)
      VALUES (${crypto.randomUUID()}, ${tenantId}, ${campagneId}, ${p.personneId}, ${p.competenceId})
      ON CONFLICT (tenant_id, campagne_id, personne_id, competence_id) DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) created++;
  }
  return created;
}

export async function listGpecEvaluationsForCampagne(tenantId: number, campagneId: string): Promise<GpecEvaluation[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_evaluation WHERE tenant_id = ${tenantId} AND campagne_id = ${campagneId}`;
  return rows.map(rowToGpecEvaluation);
}

export async function listGpecEvaluationsForPersonne(tenantId: number, personneId: string): Promise<GpecEvaluation[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`
    SELECT * FROM gpec_evaluation WHERE tenant_id = ${tenantId} AND personne_id = ${personneId}
    ORDER BY campagne_id DESC
  `;
  return rows.map(rowToGpecEvaluation);
}

/** All évaluation rows for a manager's whole managed périmètre, for one
 * campagne — the manager's saisie screen and the blind-visibility
 * projection (see lib/gpec.ts) both read from this. */
export async function listGpecEvaluationsForPersonnes(
  tenantId: number,
  campagneId: string,
  personneIds: string[]
): Promise<GpecEvaluation[]> {
  if (!sql || personneIds.length === 0) return [];
  await ensureGpecSchema();
  const rows = await sql`
    SELECT * FROM gpec_evaluation
    WHERE tenant_id = ${tenantId} AND campagne_id = ${campagneId} AND personne_id = ANY(${personneIds})
  `;
  return rows.map(rowToGpecEvaluation);
}

/** Collaborateur submitting/updating their own niveau_auto — only while the
 * campagne is 'ouverte' (checked live, not cached — see role table §6). */
export async function submitGpecNiveauAuto(
  tenantId: number,
  evaluationId: string,
  personneId: string,
  niveauAuto: number
): Promise<GpecEvaluation | null> {
  if (!sql) return null;
  await ensureGpecSchema();
  const rows = await sql`
    UPDATE gpec_evaluation e SET niveau_auto = ${niveauAuto}, date_auto = now()
    FROM gpec_campagne c
    WHERE e.id = ${evaluationId} AND e.tenant_id = ${tenantId} AND e.personne_id = ${personneId}
      AND c.id = e.campagne_id AND c.tenant_id = e.tenant_id AND c.statut = 'ouverte'
    RETURNING e.*
  `;
  return rows.length ? rowToGpecEvaluation(rows[0]) : null;
}

/** Manager submitting niveau_manager (+ commentaire/niveau_retenu once
 * discussed) for someone in their périmètre — same ouverte gate. Never
 * accepts niveau_auto: that field is collaborateur-only, enforced here by
 * simply not exposing it as a parameter. */
export async function submitGpecNiveauManager(
  tenantId: number,
  evaluationId: string,
  managerPersonneId: string,
  data: { niveauManager: number; commentaire?: string | null; niveauRetenu?: number | null }
): Promise<GpecEvaluation | null> {
  if (!sql) return null;
  await ensureGpecSchema();
  const rows = await sql`
    UPDATE gpec_evaluation e SET
      niveau_manager = ${data.niveauManager},
      date_manager = now(),
      evalue_par_id = ${managerPersonneId},
      commentaire = COALESCE(${data.commentaire ?? null}, e.commentaire),
      niveau_retenu = COALESCE(${data.niveauRetenu ?? null}, e.niveau_retenu)
    FROM gpec_campagne c
    WHERE e.id = ${evaluationId} AND e.tenant_id = ${tenantId}
      AND c.id = e.campagne_id AND c.tenant_id = e.tenant_id AND c.statut = 'ouverte'
      AND EXISTS (
        SELECT 1 FROM gpec_rattachement_manager r
        WHERE r.tenant_id = ${tenantId} AND r.manager_id = ${managerPersonneId}
          AND r.personne_id = e.personne_id AND r.date_fin IS NULL
      )
    RETURNING e.*
  `;
  return rows.length ? rowToGpecEvaluation(rows[0]) : null;
}

/** Manager validating niveau_retenu after discussion — separate from
 * submitGpecNiveauManager so it can be called again later (e.g. right after
 * an alerte, once the discussion has happened) without re-touching
 * niveau_manager itself. Never derived automatically from niveau_auto/
 * niveau_manager — always an explicit value the caller chose. Same
 * périmètre check as submitGpecNiveauManager (niveau_retenu is the
 * manager's call per the rôles/permissions table, not RH's). */
export async function setGpecNiveauRetenu(
  tenantId: number,
  evaluationId: string,
  managerPersonneId: string,
  niveauRetenu: number,
  commentaire?: string | null
): Promise<GpecEvaluation | null> {
  if (!sql) return null;
  await ensureGpecSchema();
  const rows = await sql`
    UPDATE gpec_evaluation e SET
      niveau_retenu = ${niveauRetenu},
      commentaire = COALESCE(${commentaire ?? null}, e.commentaire)
    WHERE e.tenant_id = ${tenantId} AND e.id = ${evaluationId}
      AND EXISTS (
        SELECT 1 FROM gpec_rattachement_manager r
        WHERE r.tenant_id = ${tenantId} AND r.manager_id = ${managerPersonneId}
          AND r.personne_id = e.personne_id AND r.date_fin IS NULL
      )
    RETURNING e.*
  `;
  return rows.length ? rowToGpecEvaluation(rows[0]) : null;
}

// ---- Accès Direction nominatif ----

export async function getGpecDirectionAccess(tenantId: number, employeId: number): Promise<GpecDirectionAccess | null> {
  if (!sql) return null;
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_direction_access WHERE tenant_id = ${tenantId} AND employe_id = ${employeId}`;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    tenantId: Number(r.tenant_id),
    employeId: Number(r.employe_id),
    grantedByEmployeId: Number(r.granted_by_employe_id),
    note: (r.note as string) ?? null,
    expiresAt: r.expires_at ? new Date(r.expires_at as string).toISOString() : null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function grantGpecDirectionAccess(
  tenantId: number,
  employeId: number,
  grantedByEmployeId: number,
  data: { note?: string | null; expiresAt?: string | null }
): Promise<void> {
  if (!sql) return;
  await ensureGpecSchema();
  await sql`
    INSERT INTO gpec_direction_access (tenant_id, employe_id, granted_by_employe_id, note, expires_at)
    VALUES (${tenantId}, ${employeId}, ${grantedByEmployeId}, ${data.note ?? null}, ${data.expiresAt ?? null})
    ON CONFLICT (tenant_id, employe_id) DO UPDATE SET
      granted_by_employe_id = ${grantedByEmployeId}, note = ${data.note ?? null}, expires_at = ${data.expiresAt ?? null},
      created_at = now()
  `;
}

export async function revokeGpecDirectionAccess(tenantId: number, employeId: number): Promise<void> {
  if (!sql) return;
  await ensureGpecSchema();
  await sql`DELETE FROM gpec_direction_access WHERE tenant_id = ${tenantId} AND employe_id = ${employeId}`;
}

export async function listGpecDirectionAccess(tenantId: number): Promise<GpecDirectionAccess[]> {
  if (!sql) return [];
  await ensureGpecSchema();
  const rows = await sql`SELECT * FROM gpec_direction_access WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
  return rows.map((r) => ({
    tenantId: Number(r.tenant_id),
    employeId: Number(r.employe_id),
    grantedByEmployeId: Number(r.granted_by_employe_id),
    note: (r.note as string) ?? null,
    expiresAt: r.expires_at ? new Date(r.expires_at as string).toISOString() : null,
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}
