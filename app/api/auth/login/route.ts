import { NextRequest, NextResponse } from "next/server";
import { neosLogin, NeosAuthError } from "@/lib/neos";
import { setSessionCookie } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
  }

  try {
    const session = await neosLogin(email, password);
    await setSessionCookie(session);
    return NextResponse.json({
      fullname: session.fullname,
      email: session.email,
      roles: session.roles,
    });
  } catch (err) {
    if (err instanceof NeosAuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error(err);
    return NextResponse.json({ error: "Impossible de contacter Neos" }, { status: 502 });
  }
}
