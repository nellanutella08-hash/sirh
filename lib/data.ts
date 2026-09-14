import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { NeosSession } from "./neos";
import { neosGetAll, resolveFileUrl, NeosAuthError } from "./neos";
import { calcAlerte, joursRestants, fmtFCFA, fmtDate, initials, estEmployeActuel } from "./format";
import type { Alerte } from "./format";
import { readEmployesCache, writeEmployesCache, getManagerOverrides } from "./db";

export { calcAlerte, joursRestants, fmtFCFA, fmtDate, initials };
export type { Alerte };

export interface Employe {
  id: number;
  nom: string;
  prenoms: string;
  fullname: string;
  email: string;
  username: string;
  genre: string;
  dateNaissance: string | null;
  dateEntree: string | null;
  statutMatrimonial: string | null;
  nationality: string | null;
  entiteId: number | null;
  entite: string;
  fonction: string;
  contratType: string;
  contratActif: boolean;
  salNet: number | null;
  salBrut: number | null;
  dateDebut: string | null;
  dateFin: string | null;
  alerte: Alerte;
  actif: boolean;
  contractNumber: string | null;
  photoUrl: string | null;
  telephone: string | null;
  managerId: number | null;
  managerNom: string | null;
}

// ---------- raw Neos shapes (only the fields we read) ----------

interface NeosRef {
  id?: number;
  name?: string;
  socialReason?: string;
  shortName?: string;
}

interface NeosManagerRef {
  id: number;
  fullname?: string;
  firstname?: string;
  lastname?: string;
}

interface NeosFile {
  fileUrl?: string;
}

interface NeosUser {
  id: number;
  username?: string;
  firstname?: string;
  lastname?: string;
  fullname?: string;
  email?: string;
  gender?: string;
  dateOfBirth?: string;
  dateOfEntry?: string;
  maritalStatus?: string;
  nationality?: string | NeosRef;
  contacts?: string;
  isActive?: boolean;
  enterprise?: NeosRef;
  department?: NeosRef;
  function?: NeosRef;
  contractType?: NeosRef;
  profilePic?: NeosFile;
  manager?: NeosManagerRef;
}

interface NeosContract {
  id: number;
  startDate?: string;
  endDate?: string | null;
  netSalary?: number;
  grossSalary?: number;
  isActive?: boolean;
  contractNumber?: string;
  type?: NeosRef;
  enterprise?: NeosRef;
  user?: { id: number };
  manager?: NeosManagerRef;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

/** Ranks a contract by how well it represents the person's *current*
 * situation: genuinely active (isActive and not yet expired) beats
 * isActive-but-expired (present in Neos but never closed out on renewal)
 * beats not active at all. A person can have several isActive contracts
 * at once (a stale one left open when a new one was issued) — without
 * this, picking "most recently started" among them can select a short,
 * already-expired one over their real, ongoing contract. */
function contractRank(c: NeosContract): number {
  if (c.isActive !== true) return 0;
  if (!c.endDate) return 2;
  return daysUntil(c.endDate) >= 0 ? 2 : 1;
}

/** Picks, per user id, the contract that best represents their current
 * situation — see contractRank; among ties the most recently started
 * contract wins. */
function pickBestContract(contracts: NeosContract[]): Map<number, NeosContract> {
  const byUser = new Map<number, NeosContract>();
  for (const c of contracts) {
    const uid = c.user?.id;
    if (!uid) continue;
    const current = byUser.get(uid);
    if (!current) {
      byUser.set(uid, c);
      continue;
    }
    const currentScore = contractRank(current);
    const newScore = contractRank(c);
    if (newScore > currentScore) {
      byUser.set(uid, c);
    } else if (newScore === currentScore) {
      const currentStart = current.startDate ? new Date(current.startDate).getTime() : 0;
      const newStart = c.startDate ? new Date(c.startDate).getTime() : 0;
      if (newStart > currentStart) byUser.set(uid, c);
    }
  }
  return byUser;
}

function refName(ref: NeosRef | undefined, fallback = "—"): string {
  return ref?.shortName || ref?.socialReason || ref?.name || fallback;
}

function managerName(m: NeosManagerRef | undefined): string | null {
  if (!m) return null;
  return m.fullname || `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim() || null;
}

async function fetchEmployesFor(session: NeosSession): Promise<Employe[]> {
  const [allUsers, contracts] = await Promise.all([
    neosGetAll(session, "users") as unknown as Promise<NeosUser[]>,
    neosGetAll(session, "contracts") as unknown as Promise<NeosContract[]>,
  ]);

  // Only active Neos accounts count as current employees — every KPI/chart
  // built on top of getEmployes() advertises itself as "actifs".
  const users = allUsers.filter((u) => u.isActive ?? true);
  const contractsByUser = pickBestContract(contracts);

  const employes = users.map((u): Employe => {
    const c = contractsByUser.get(u.id);
    const contratType = refName(c?.type ?? u.contractType, "—");
    const dateFin = c?.endDate ?? null;
    const nationality =
      typeof u.nationality === "string" ? u.nationality : u.nationality?.name ?? null;
    // The contract's manager (who signed it) takes precedence over the
    // user profile's, same precedence rule as contratType/entite above.
    const manager = c?.manager ?? u.manager;

    return {
      id: u.id,
      nom: u.lastname ?? "",
      prenoms: u.firstname ?? "",
      fullname: u.fullname ?? `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim(),
      email: u.email ?? "",
      username: u.username ?? "",
      genre: u.gender ?? "",
      dateNaissance: u.dateOfBirth ?? null,
      dateEntree: u.dateOfEntry ?? null,
      statutMatrimonial: u.maritalStatus ?? null,
      nationality,
      entiteId: c?.enterprise?.id ?? u.enterprise?.id ?? null,
      entite: refName(c?.enterprise ?? u.enterprise, "—"),
      fonction: refName(u.function, "—"),
      contratType,
      contratActif: c?.isActive === true,
      salNet: c?.netSalary ?? null,
      salBrut: c?.grossSalary ?? null,
      dateDebut: c?.startDate ?? null,
      dateFin,
      alerte: calcAlerte(contratType, dateFin),
      actif: u.isActive ?? true,
      contractNumber: c?.contractNumber ?? null,
      photoUrl: resolveFileUrl(u.profilePic?.fileUrl),
      telephone: u.contacts ?? null,
      managerId: manager?.id ?? null,
      managerNom: managerName(manager),
    };
  });

  // A "current employee" is someone whose contract is isActive in Neos and
  // not past its end date (verified against Neos's own active-contracts
  // list — see estEmployeActuel). Contracts ending within 14 days still
  // count here, flagged separately via the "a_renouveler" alert badge.
  return employes.filter((e) => estEmployeActuel(e.dateFin, e.contratActif));
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — Neos pagination is slow, refresh hourly

/** Fetches the employe list, going through the optional Neon/Postgres cache
 * (see lib/db.ts) when DATABASE_URL is configured. Falls back to a direct
 * Neos fetch transparently if no DB is configured or the cache read fails,
 * so the app works identically either way. */
async function fetchEmployesCached(session: NeosSession): Promise<Employe[]> {
  const cached = await readEmployesCache(session.tenantId);
  if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
    return cached.payload as Employe[];
  }
  const fresh = await fetchEmployesFor(session);
  void writeEmployesCache(session.tenantId, fresh);
  return fresh;
}

/** Manual corrections to Neos's own `manager` field (see lib/db.ts) are
 * applied fresh on every call rather than baked into the Neos-data cache
 * above, so an RH correction takes effect immediately instead of waiting
 * out the 1h Neos cache TTL. */
async function applyManagerOverrides(tenantId: number, employes: Employe[]): Promise<Employe[]> {
  const overrides = await getManagerOverrides(tenantId);
  if (overrides.size === 0) return employes;
  return employes.map((e) => {
    const o = overrides.get(e.id);
    return o ? { ...e, managerId: o.managerId, managerNom: o.managerNom } : e;
  });
}

/** Memoized per request: multiple pages/components calling this within the
 * same render only trigger one round-trip to Neos (or to the cache). */
export const getEmployes = cache(async (session: NeosSession) => {
  const employes = await fetchEmployesCached(session);
  return applyManagerOverrides(session.tenantId, employes);
});

export async function getEmploye(session: NeosSession, id: number): Promise<Employe | null> {
  const all = await getEmployes(session);
  return all.find((e) => e.id === id) ?? null;
}

/** Same as getEmployes, but redirects to /login (clearing the now-useless
 * cookie) instead of throwing when the Neos JWT has expired mid-session —
 * use this from page components so an expired token degrades gracefully. */
export async function requireEmployes(session: NeosSession): Promise<Employe[]> {
  try {
    return await getEmployes(session);
  } catch (err) {
    if (err instanceof NeosAuthError) redirect("/api/auth/expire");
    throw err;
  }
}

export async function requireEmploye(session: NeosSession, id: number): Promise<Employe | null> {
  const all = await requireEmployes(session);
  return all.find((e) => e.id === id) ?? null;
}

// ---------- enterprises (per-entité letterhead data, for document templates) ----------

export interface Enterprise {
  id: number;
  nom: string;
  rccm: string | null;
  adresse: string | null;
  logoUrl: string | null;
  documentFooter: string | null;
  taxpayerAccountNumber: string | null;
  taxRegime: string | null;
  taxCenter: string | null;
}

interface NeosEnterprise {
  id: number;
  socialReason?: string;
  shortName?: string;
  rccm?: string;
  address?: string;
  logo?: NeosFile;
  documentFooter?: string;
  taxpayerAccountNumber?: string;
  taxRegime?: string;
  taxCenter?: string;
}

async function fetchEnterprisesFor(session: NeosSession): Promise<Enterprise[]> {
  const raw = (await neosGetAll(session, "enterprises")) as unknown as NeosEnterprise[];
  return raw.map((e) => ({
    id: e.id,
    nom: e.socialReason || e.shortName || "—",
    rccm: e.rccm ?? null,
    adresse: e.address ?? null,
    logoUrl: resolveFileUrl(e.logo?.fileUrl),
    documentFooter: e.documentFooter ?? null,
    taxpayerAccountNumber: e.taxpayerAccountNumber ?? null,
    taxRegime: e.taxRegime ?? null,
    taxCenter: e.taxCenter ?? null,
  }));
}

export const getEnterprises = cache(fetchEnterprisesFor);

export async function getEnterprise(session: NeosSession, id: number): Promise<Enterprise | null> {
  const all = await getEnterprises(session);
  return all.find((e) => e.id === id) ?? null;
}

/** Same as getEnterprises, but redirects to /login (clearing the now-useless
 * cookie) instead of throwing when the Neos JWT has expired mid-session —
 * use this from page components so an expired token degrades gracefully. */
export async function requireEnterprises(session: NeosSession): Promise<Enterprise[]> {
  try {
    return await getEnterprises(session);
  } catch (err) {
    if (err instanceof NeosAuthError) redirect("/api/auth/expire");
    throw err;
  }
}

// ---------- aggregations ----------

export interface Kpis {
  total: number;
  cdi: number;
  aRenouveler: number; // urgent + attention (<=90j, not yet critical)
  renouvellementImmediat: number; // <=14j — needs paperwork started now
  expires: number;
  masseNette: number;
}

export function getKpis(employes: Employe[]): Kpis {
  return {
    total: employes.length,
    cdi: employes.filter((e) => e.alerte === "cdi").length,
    aRenouveler: employes.filter((e) => e.alerte === "urgent" || e.alerte === "attention").length,
    renouvellementImmediat: employes.filter((e) => e.alerte === "a_renouveler").length,
    expires: employes.filter((e) => e.alerte === "expiré").length,
    masseNette: employes.reduce((s, e) => s + (e.salNet ?? 0), 0),
  };
}

export function countBy(employes: Employe[], key: keyof Employe): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of employes) {
    const v = String(e[key] ?? "—");
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

export function sumByGroup(
  employes: Employe[],
  groupKey: keyof Employe,
  valueKey: "salNet" | "salBrut"
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of employes) {
    const v = String(e[groupKey] ?? "—");
    out[v] = (out[v] ?? 0) + (e[valueKey] ?? 0);
  }
  return out;
}

export interface Demographics {
  genre: Record<string, number>;
  ages: Record<string, number>;
  nationalites: [string, number][];
  statutMatrimonial: Record<string, number>;
}

const AGE_BUCKETS: [string, number, number][] = [
  ["< 25 ans", 0, 24],
  ["25 – 34 ans", 25, 34],
  ["35 – 44 ans", 35, 44],
  ["45 – 54 ans", 45, 54],
  ["55 ans et +", 55, 200],
];

function ageFromBirthdate(d: string): number {
  const birth = new Date(d);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

export function getDemographics(employes: Employe[]): Demographics {
  const genre: Record<string, number> = {};
  const ages: Record<string, number> = Object.fromEntries(AGE_BUCKETS.map(([l]) => [l, 0]));
  const nat: Record<string, number> = {};
  const statut: Record<string, number> = {};

  for (const e of employes) {
    const g = e.genre === "M" ? "Hommes" : e.genre === "F" ? "Femmes" : "Non renseigné";
    genre[g] = (genre[g] ?? 0) + 1;

    if (e.dateNaissance) {
      const age = ageFromBirthdate(e.dateNaissance);
      const bucket = AGE_BUCKETS.find(([, min, max]) => age >= min && age <= max);
      if (bucket) ages[bucket[0]]++;
    }

    if (e.nationality) nat[e.nationality] = (nat[e.nationality] ?? 0) + 1;

    const s = e.statutMatrimonial
      ? { single: "Célibataire", married: "Marié(e)", divorced: "Divorcé(e)", widowed: "Veuf/Veuve" }[
          e.statutMatrimonial
        ] ?? e.statutMatrimonial
      : "Non renseigné";
    statut[s] = (statut[s] ?? 0) + 1;
  }

  const nationalites = Object.entries(nat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return { genre, ages, nationalites, statutMatrimonial: statut };
}

