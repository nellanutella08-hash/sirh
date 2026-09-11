import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getEmployes } from "@/lib/data";
import { NeosAuthError } from "@/lib/neos";

/** Lightweight index for the global search bar: fetched once client-side
 * and filtered locally on every keystroke, so search itself never round-
 * trips to the server. Backed by the same (Neon-cached) employe data as
 * the rest of the app, so it's fast once that cache is warm. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const employes = await getEmployes(session);
    return NextResponse.json(
      employes.map((e) => ({
        id: e.id,
        fullname: e.fullname,
        entite: e.entite,
        fonction: e.fonction,
        photoUrl: e.photoUrl,
      }))
    );
  } catch (err) {
    if (err instanceof NeosAuthError) {
      return NextResponse.json({ error: "Session Neos expirée" }, { status: 401 });
    }
    console.error("[search index]", err);
    return NextResponse.json({ error: "Erreur Neos" }, { status: 502 });
  }
}
