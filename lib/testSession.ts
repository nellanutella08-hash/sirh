import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

const TTL_MS = 15 * 60 * 1000; // 15 minutes to actually open the link

interface TestTokenPayload {
  tenantId: number;
  userId: number;
  fullname: string;
  email: string;
  photoUrl: string | null;
  exp: number;
}

const DEV_FALLBACK_SECRET = "dev-only-insecure-session-secret";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set — refusing to sign test-session tokens in production");
  }
  return DEV_FALLBACK_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Mints a short-lived, self-contained "log in as this person" capability
 * — RH picks a real employé (any role stripped to plain ROLE_USER), the
 * token bakes in that snapshot so consuming it never needs a live Neos
 * call. Only ever minted by an RH session (see the API route), so this
 * is the one place a non-RH identity gets created without a password. */
export function mintTestToken(data: { tenantId: number; userId: number; fullname: string; email: string; photoUrl: string | null }): string {
  const payload: TestTokenPayload = { ...data, exp: Date.now() + TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyTestToken(token: string): TestTokenPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = sign(encoded);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TestTokenPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
