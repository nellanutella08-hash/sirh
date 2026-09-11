import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Sidebar } from "@/components/Sidebar";
import { GlobalSearch } from "@/components/GlobalSearch";

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

  // Deliberately NOT fetching employe/KPI data here: this layout wraps every
  // page, so awaiting Neos's (slow, paginated) data here would block the
  // whole shell — sidebar included — on every navigation. The sidebar's
  // alert-count badge fetches itself client-side (see Sidebar.tsx) instead,
  // and each page's own loading.tsx covers its own data fetch.
  const role = session.roles.map((r) => ROLE_LABELS[r]).find(Boolean) ?? "Collaborateur";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar fullname={session.fullname} role={role} photoUrl={session.photoUrl} />
      <div className="flex-1 overflow-y-auto bg-bg">
        <div className="sticky top-0 z-20 flex h-14 items-center border-b border-v/10 bg-white px-6">
          <GlobalSearch />
        </div>
        {children}
      </div>
    </div>
  );
}
