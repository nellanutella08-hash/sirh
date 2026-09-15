import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { getEmployes } from "@/lib/data";
import { fetchRapportMensuel, defaultYearMonth } from "@/lib/rapportMensuel";
import { renderRapportMensuelXlsx } from "@/lib/rapportXlsx";
import { NeosAuthError } from "@/lib/neos";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const monthParam = req.nextUrl.searchParams.get("month");
  const yearMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : defaultYearMonth();

  let employes;
  try {
    employes = await getEmployes(session);
  } catch (err) {
    if (err instanceof NeosAuthError) {
      return NextResponse.json({ error: "Session Neos expirée" }, { status: 401 });
    }
    throw err;
  }

  const rapport = await fetchRapportMensuel(session.tenantId, employes, yearMonth);
  const xlsx = renderRapportMensuelXlsx(rapport);

  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rapport-rh-${yearMonth}.xlsx"`,
    },
  });
}
