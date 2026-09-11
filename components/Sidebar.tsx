"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { initials } from "@/lib/format";

const NAV = [
  {
    section: "Principal",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: "grid" },
      { href: "/personnel", label: "Personnel", icon: "users" },
      { href: "/contrats", label: "Contrats & Alertes", icon: "file" },
    ],
  },
  {
    section: "Analyses",
    items: [
      { href: "/masse-salariale", label: "Masse Salariale", icon: "trending" },
      { href: "/demographie", label: "Démographie", icon: "search" },
    ],
  },
  {
    section: "Administration",
    items: [
      { href: "/conges", label: "Congés & Absences", icon: "calendar" },
      { href: "/rapports", label: "Rapports", icon: "report" },
    ],
  },
] as const;

function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    className: "shrink-0 opacity-80",
  };
  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case "trending":
      return (
        <svg {...common}>
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "report":
      return (
        <svg {...common}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    default:
      return null;
  }
}

export function Sidebar({
  fullname,
  role,
  alertCount,
}: {
  fullname: string;
  role: string;
  alertCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="flex w-[220px] min-w-[220px] flex-col overflow-y-auto bg-vd">
      <div className="border-b border-white/10 px-4 pb-3 pt-5">
        <div className="text-lg font-semibold tracking-tight text-white">Synelia RH</div>
        <div className="mt-0.5 text-[11px] font-light text-white/50">SIRH</div>
      </div>
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mg text-xs font-semibold text-white">
          {initials(fullname)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-white">{fullname}</div>
          <div className="text-[10px] text-white/50">{role}</div>
        </div>
        <button
          onClick={logout}
          title="Se déconnecter"
          className="shrink-0 text-white/40 hover:text-white"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
      <div className="flex-1 px-2 py-3">
        {NAV.map((section) => (
          <div key={section.section}>
            <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
              {section.section}
            </div>
            {section.items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                    active
                      ? "bg-vm font-medium text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.href === "/contrats" && alertCount > 0 && (
                    <span className="ml-auto min-w-[18px] rounded-full bg-wn px-1.5 text-center text-[10px] font-semibold text-white">
                      {alertCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
