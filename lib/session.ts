import "server-only";
import { cookies } from "next/headers";
import type { NeosSession } from "./neos";
import { SESSION_COOKIE_NAME_PROXY } from "./constants";

const COOKIE_NAME = SESSION_COOKIE_NAME_PROXY;
const MAX_AGE = 60 * 60 * 8; // 8h

export async function setSessionCookie(session: NeosSession) {
  const store = await cookies();
  store.set(COOKIE_NAME, JSON.stringify(session), {
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
  try {
    return JSON.parse(raw) as NeosSession;
  } catch {
    return null;
  }
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
