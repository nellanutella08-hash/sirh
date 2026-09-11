"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";

const COLLAPSE_KEY = "sirh_sidebar_collapsed";

const NAV = [
  {
    section: "Principal",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: "grid" },
      { href: "/personnel", label: "Personnel", icon: "users" },
      { href: "/contrats", label: "Contrats & Alertes", icon: "file" },
      { href: "/recrutement", label: "Recrutement", icon: "userplus" },
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
      { href: "/evaluations", label: "Évaluations", icon: "target" },
      { href: "/documents", label: "Demandes de documents", icon: "docrequest" },
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
    case "userplus":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
      );
    case "target":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "docrequest":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="15" x2="12" y2="18" />
          <line x1="12" y1="18" x2="15" y2="15" />
          <line x1="12" y1="18" x2="12" y2="11" />
        </svg>
      );
    default:
      return null;
  }
}

export function Sidebar({
  fullname,
  role,
  photoUrl,
}: {
  fullname: string;
  role: string;
  photoUrl: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [alertCount, setAlertCount] = useState<number | null>(null);

  useEffect(() => {
    // Reads localStorage (unavailable during SSR) once after mount; SSR/first
    // paint always show expanded, matching the server render exactly, then
    // this flips to the persisted state — a deliberate hydration-safe
    // "flash of default" rather than a derivable/computable value.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/kpis/alert-count")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (!cancelled && typeof data.count === "number") setAlertCount(data.count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <nav
      className={`relative flex shrink-0 flex-col overflow-y-auto bg-vd transition-[width] duration-200 ${
        collapsed ? "w-[68px]" : "w-[220px]"
      } ${mounted ? "" : "duration-0"}`}
    >
      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Déplier le menu" : "Replier le menu"}
        className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-vd text-white/60 shadow-md hover:text-white"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="border-b border-white/10 px-4 pb-3 pt-5">
        <div className="truncate text-lg font-semibold tracking-tight text-white">
          {collapsed ? "S" : "Synelia RH"}
        </div>
        {!collapsed && <div className="mt-0.5 text-[11px] font-light text-white/50">SIRH</div>}
      </div>
      <div
        className={`flex items-center border-b border-white/10 py-3 ${
          collapsed ? "justify-center px-2" : "gap-2.5 px-4"
        }`}
      >
        <div title={collapsed ? `${fullname} — ${role}` : undefined}>
          <Avatar photoUrl={photoUrl} fullname={fullname} size={32} bg="bg-mg" />
        </div>
        {!collapsed && (
          <>
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
          </>
        )}
      </div>
      <div className="flex-1 px-2 py-3">
        {NAV.map((section) => (
          <div key={section.section}>
            {!collapsed && (
              <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                {section.section}
              </div>
            )}
            {section.items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`relative mb-0.5 flex items-center rounded-lg py-2 text-[13px] transition-colors ${
                    collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
                  } ${
                    active
                      ? "bg-vm font-medium text-white"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon name={item.icon} />
                  {!collapsed && <span>{item.label}</span>}
                  {item.href === "/contrats" &&
                    (alertCount === null ? (
                      <span
                        className={`animate-pulse rounded-full bg-white/15 ${
                          collapsed ? "absolute right-1.5 top-1.5 h-2 w-2" : "ml-auto h-4 w-6"
                        }`}
                      />
                    ) : (
                      alertCount > 0 &&
                      (collapsed ? (
                        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-wn" />
                      ) : (
                        <span className="ml-auto min-w-[18px] rounded-full bg-wn px-1.5 text-center text-[10px] font-semibold text-white">
                          {alertCount}
                        </span>
                      ))
                    ))}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
