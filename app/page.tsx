import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(isRH(session) ? "/dashboard" : "/mes-documents");
}
