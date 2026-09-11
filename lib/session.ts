import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import type { NeosSession } from "./neos";
import { SESSION_COOKIE_NAME_PROXY } from "./constants";

const COOKIE_NAME = SESSION_COOKIE_NAME_PROXY;
const MAX_AGE = 60 * 60 * 8; // 8h

const DEV_FALLBACK_SECRET = "dev-only-insecure-session-secret";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is not set — refusing to sign/verify session cookies in production"
    );
  }
  console.warn("[session] SESSION_SECRET not set — using an insecure dev-only default");
  return DEV_FALLBACK_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Session cookies carry the Neos JWT, tenantId and roles used to scope
 * every Neos API call. httpOnly stops JS/XSS reads but not a client
 * rewriting the raw cookie value (e.g. via devtools), so the payload is
 * HMAC-signed and any tampering is rejected rather than trusted. */
export async function setSessionCookie(session: NeosSession) {
  const store = await cookies();
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const value = `${payload}.${sign(payload)}`;
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<NeosSession | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as NeosSession;
  } catch {
    return null;
  }
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
