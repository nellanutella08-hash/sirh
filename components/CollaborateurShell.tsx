"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";

const NAV = [
  { href: "/mon-profil", label: "Mon profil" },
  { href: "/mes-documents", label: "Mes documents" },
  { href: "/mes-conges", label: "Mes congés" },
] as const;

export function CollaborateurShell({
  fullname,
  photoUrl,
  children,
}: {
  fullname: string;
  photoUrl: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-20 flex items-center gap-4 border-b border-v/10 bg-white px-6 py-3 print:hidden">
        <span className="text-base font-semibold tracking-tight text-v">Synelia RH</span>
        <nav className="ml-4 flex gap-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  active ? "bg-gl text-v" : "text-gm hover:bg-gl hover:text-nb"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <Avatar photoUrl={photoUrl} fullname={fullname} size={28} />
          <span className="text-xs font-medium text-nb">{fullname}</span>
          <button
            onClick={logout}
            title="Se déconnecter"
            className="ml-1 text-gm hover:text-nb"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
