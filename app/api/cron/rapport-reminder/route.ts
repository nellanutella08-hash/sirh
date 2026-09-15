import { NextRequest, NextResponse } from "next/server";
import { defaultYearMonth } from "@/lib/rapportMensuel";
import { sendRapportMensuelReminder } from "@/lib/zimbra";

/** Runs monthly (see vercel.json), same idea as conges-accrual: RH asked
 * for a "calendrier" alongside the monthly RH Group dashboard, i.e. a
 * standing reminder rather than something they have to remember to check
 * for themselves. Unlike conges-accrual this sends exactly one email per
 * run (not one per tenant) — notifications go to a single fixed RH
 * address (see NOTIFY_TO in lib/zimbra.ts), so looping tenants would just
 * duplicate the same email. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yearMonth = defaultYearMonth();
  const [y, m] = yearMonth.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  await sendRapportMensuelReminder({ yearMonth, label });

  return NextResponse.json({ ok: true, yearMonth });
}
