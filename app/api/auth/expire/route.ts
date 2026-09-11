import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

/** Hit when a page detects the Neos JWT expired mid-session (see
 * app/(app)/layout.tsx): clears the now-useless session cookie and sends
 * the user back to /login. A plain redirect() from a Server Component
 * can't also clear cookies, so that work happens here instead. */
export async function GET(req: Request) {
  await clearSessionCookie();
  return NextResponse.redirect(new URL("/login", req.url));
}
