import "server-only";

const BASE_URL = process.env.NEOS_BASE_URL || "https://neos-back.synelia.tech";

export interface NeosSession {
  token: string;
  tenantId: number;
  userId: number;
  fullname: string;
  email: string;
  roles: string[];
}

export class NeosAuthError extends Error {}

/** Authenticate against Neos and resolve the tenant id from tenantUsers. */
export async function neosLogin(
  username: string,
  password: string
): Promise<NeosSession> {
  const res = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store",
  });

  if (res.status === 401) throw new NeosAuthError("Identifiants invalides");
  if (!res.ok) throw new NeosAuthError(`Erreur Neos (${res.status})`);

  const data = await res.json();
  const tenantId: number | undefined = data.user?.tenantUsers?.find(
    (tu: { tenant?: { id?: number } }) => tu.tenant?.id
  )?.tenant?.id;

  if (!tenantId) throw new NeosAuthError("Aucun tenant trouvé pour cet utilisateur");

  return {
    token: data.token,
    tenantId,
    userId: data.user.id,
    fullname: data.user.fullname,
    email: data.user.email,
    roles: data.user.roles ?? [],
  };
}

function headersFor(session: NeosSession): HeadersInit {
  return {
    Authorization: `Bearer ${session.token}`,
    Accept: "application/ld+json",
    "tenant-id": String(session.tenantId),
  };
}

/** GET a single Neos collection page, tolerating the API's quirky nested
 * `hydra:member` shape seen on some endpoints (e.g. /api/contracts), where
 * the real items live in `hydra:member[0]` instead of directly in
 * `hydra:member`. */
async function fetchPage(
  session: NeosSession,
  resource: string,
  params: Record<string, string>
): Promise<{ items: Record<string, unknown>[]; totalItems: number | null }> {
  const url = new URL(`${BASE_URL}/api/${resource}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: headersFor(session),
    next: { revalidate: 3600 },
  });

  if (res.status === 401) throw new NeosAuthError("Session Neos expirée");
  if (!res.ok) throw new Error(`Neos ${resource} -> ${res.status}`);

  const data = await res.json();
  const member = data["hydra:member"];
  const totalItems =
    typeof data["hydra:totalItems"] === "number" ? data["hydra:totalItems"] : null;

  if (Array.isArray(member) && member.length > 0 && Array.isArray(member[0])) {
    return { items: member[0], totalItems };
  }
  return { items: Array.isArray(member) ? member : [], totalItems };
}

/** Fetch an entire Neos collection, paginating until a short page is seen. */
export async function neosGetAll(
  session: NeosSession,
  resource: string,
  params: Record<string, string> = {},
  pageSize = 100,
  maxPages = 30
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 1;
  for (; page <= maxPages; page++) {
    const { items } = await fetchPage(session, resource, {
      ...params,
      page: String(page),
      itemsPerPage: String(pageSize),
    });
    all.push(...items);
    if (items.length < pageSize) break;
  }
  if (page > maxPages) {
    console.warn(
      `[neos] ${resource}: hit maxPages=${maxPages} (pageSize=${pageSize}) — results may be truncated past ${maxPages * pageSize} rows`
    );
  }
  return all;
}

export async function neosGetOne(
  session: NeosSession,
  resource: string,
  id: number | string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE_URL}/api/${resource}/${id}`, {
    headers: headersFor(session),
    next: { revalidate: 3600 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Neos ${resource}/${id} -> ${res.status}`);
  return res.json();
}
