import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getEmployes, getKpis } from "@/lib/data";
import { Sidebar } from "@/components/Sidebar";

const ROLE_LABELS: Record<string, string> = {
  ROLE_RH: "Équipe RH",
  ROLE_SG: "Secrétariat Général",
  ROLE_SUPER_ADMIN: "Administrateur",
  ROLE_DT: "Direction Technique",
  ROLE_FINANCE: "Finance",
  ROLE_PROJET: "Chef de projet",
  ROLE_ACHAT: "Achats",
  ROLE_USER: "Collaborateur",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const employes = await getEmployes(session);
  const kpis = getKpis(employes);
  const role =
    session.roles.map((r) => ROLE_LABELS[r]).find(Boolean) ?? "Collaborateur";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar fullname={session.fullname} role={role} alertCount={kpis.aRenouveler + kpis.expires} />
      <div className="flex-1 overflow-y-auto bg-bg">{children}</div>
    </div>
  );
}
