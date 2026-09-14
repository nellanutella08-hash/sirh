import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME_PROXY } from "@/lib/constants";

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME_PROXY);
  const { pathname } = request.nextUrl;

  if (!hasSession && pathname !== "/login") {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }

  if (hasSession && pathname === "/login") {
    // "/" resolves the right destination server-side based on role.
    const url = new URL("/", request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
