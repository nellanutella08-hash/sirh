import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getEmployes, getKpis } from "@/lib/data";
import { NeosAuthError } from "@/lib/neos";

/** Fetched client-side by the sidebar so the app shell never blocks on
 * Neos's (slow, paginated) employe data — see app/(app)/layout.tsx. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const employes = await getEmployes(session);
    const kpis = getKpis(employes);
    return NextResponse.json({
      count: kpis.aRenouveler + kpis.renouvellementImmediat + kpis.expires,
    });
  } catch (err) {
    if (err instanceof NeosAuthError) {
      return NextResponse.json({ error: "Session Neos expirée" }, { status: 401 });
    }
    console.error("[alert-count]", err);
    return NextResponse.json({ error: "Erreur Neos" }, { status: 502 });
  }
}
