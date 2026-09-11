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
