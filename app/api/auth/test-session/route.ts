import { NextRequest, NextResponse } from "next/server";
import { getSession, setSessionCookie } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { requireEmploye } from "@/lib/data";
import { mintTestToken, verifyTestToken } from "@/lib/testSession";
import { NeosAuthError } from "@/lib/neos";

/** RH-only: mints a "log in as this person" link for a real employé, role
 * stripped to plain ROLE_USER — lets RH test the collaborateur/manager
 * experience themselves without a second Neos password. Never reuses the
 * caller's real Neos JWT (the impersonated session gets a harmless
 * placeholder token instead), so live Neos calls simply won't work under
 * it — only cached employee data and this app's own Postgres-backed
 * features (évaluations, congés, etc.) do, which is all that's needed to
 * test the évaluations module. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const body = await req.json();
  const employeId = Number(body?.employeId);
  if (!employeId) return NextResponse.json({ error: "Collaborateur requis" }, { status: 400 });

  let employe;
  try {
    employe = await requireEmploye(session, employeId);
  } catch (err) {
    if (err instanceof NeosAuthError) {
      return NextResponse.json({ error: "Session Neos expirée" }, { status: 401 });
    }
    throw err;
  }
  if (!employe) return NextResponse.json({ error: "Collaborateur introuvable" }, { status: 404 });

  const token = mintTestToken({
    tenantId: session.tenantId,
    userId: employe.id,
    fullname: employe.fullname,
    email: employe.email,
    photoUrl: employe.photoUrl,
  });

  const url = new URL("/api/auth/test-session", req.nextUrl.origin);
  url.searchParams.set("token", token);
  return NextResponse.json({ url: url.toString(), employeNom: employe.fullname });
}

/** Consumes the link — no session/role check here, the token itself is
 * the authorization (minted only by an RH click above). Sets a fresh
 * session cookie for the impersonated employé and redirects into the app. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const payload = token ? verifyTestToken(token) : null;
  if (!payload) {
    return NextResponse.redirect(new URL("/login?error=lien_test_expire", req.nextUrl.origin));
  }

  await setSessionCookie({
    token: "impersonated",
    tenantId: payload.tenantId,
    userId: payload.userId,
    fullname: payload.fullname,
    email: payload.email,
    roles: ["ROLE_USER"],
    photoUrl: payload.photoUrl,
  });

  return NextResponse.redirect(new URL("/mon-tableau-de-bord", req.nextUrl.origin));
}
