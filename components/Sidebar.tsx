"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/Avatar";

const COLLAPSE_KEY = "sirh_sidebar_collapsed";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export interface NavSection {
  section: string;
  items: readonly NavItem[];
}

export const RH_NAV: readonly NavSection[] = [
  {
    section: "Principal",
    items: [
      { href: "/accueil", label: "Accueil", icon: "home" },
      { href: "/dashboard", label: "Tableau de bord", icon: "grid" },
      { href: "/personnel", label: "Personnel", icon: "users" },
      { href: "/organigramme", label: "Organigramme", icon: "sitemap" },
      { href: "/recrutement", label: "Recrutement", icon: "userplus" },
      { href: "/contrats", label: "Contrats & Alertes", icon: "file" },
    ],
  },
  {
    // Tout ce qui concerne le suivi des équipes (pas soi-même) : validations,
    // congés d'équipe, campagnes d'évaluation, demandes de documents —
    // regroupé ici pour ne plus être éclaté entre "Mon espace" et
    // "Administration".
    section: "Gestion RH",
    items: [
      { href: "/conges", label: "Congés & Absences", icon: "calendar" },
      { href: "/validations-conges", label: "Validations congés", icon: "target" },
      { href: "/evaluations", label: "Évaluations", icon: "target" },
      { href: "/documents", label: "Demandes de documents", icon: "docrequest" },
    ],
  },
  {
    // L'équipe RH est aussi composée d'employés : ce lien leur donne le même
    // espace 100% self-service (profil, congés, objectifs — rien qui
    // concerne la gestion d'autrui) que celui des autres collaborateurs, en
    // plus de leurs vues d'admin ci-dessus.
    section: "Mon espace",
    items: [
      { href: "/mon-profil", label: "Mon profil", icon: "profile" },
      { href: "/mon-contrat", label: "Mon contrat", icon: "file" },
      { href: "/mes-documents", label: "Mes documents", icon: "docrequest" },
      { href: "/mes-conges", label: "Mes congés", icon: "calendar" },
      { href: "/evaluations?vue=perso", label: "Mes objectifs", icon: "flag" },
    ],
  },
  {
    section: "Pilotage",
    items: [
      { href: "/masse-salariale", label: "Masse Salariale", icon: "trending" },
      { href: "/demographie", label: "Démographie", icon: "search" },
      { href: "/rapports", label: "Rapports", icon: "report" },
    ],
  },
  {
    section: "Administration",
    items: [{ href: "/entites", label: "Entités juridiques", icon: "building" }],
  },
] as const;

export const COLLABORATEUR_NAV: readonly NavSection[] = [
  {
    // 100% self-service, comme pour la RH — rien qui concerne la gestion
    // d'autrui (voir "Gestion d'équipe" ci-dessous).
    section: "Mon espace",
    items: [
      { href: "/accueil", label: "Accueil", icon: "home" },
      { href: "/mon-tableau-de-bord", label: "Tableau de bord", icon: "grid" },
      { href: "/mon-profil", label: "Mon profil", icon: "profile" },
      { href: "/mon-contrat", label: "Mon contrat", icon: "file" },
      { href: "/mes-documents", label: "Mes documents", icon: "docrequest" },
      { href: "/mes-conges", label: "Mes congés", icon: "calendar" },
      { href: "/evaluations?vue=perso", label: "Mes objectifs", icon: "flag" },
    ],
  },
  {
    // Vue d'ensemble de l'entreprise, en lecture seule et sans aucune donnée
    // sensible (voir AnnuaireEmploye) — accessible à tout collaborateur, pas
    // seulement à la RH.
    section: "Entreprise",
    items: [
      { href: "/annuaire", label: "Annuaire", icon: "users" },
      { href: "/organigramme", label: "Organigramme", icon: "sitemap" },
    ],
  },
  {
    // Pour qui encadre une équipe (le layout ne sait pas qui, faute de
    // données Neos chargées à ce niveau — voir app/(app)/layout.tsx) :
    // séparé de "Mon espace" pour ne pas mélanger self-service et gestion
    // d'autrui, même si la page elle-même reste vide pour qui ne gère
    // personne.
    section: "Gestion d'équipe",
    items: [{ href: "/validations-conges", label: "Validations congés", icon: "target" }],
  },
] as const;

// Exported so the /accueil portal's tiles reuse the exact same glyphs as
// the sidebar links they mirror, instead of a second, drifting icon set.
export function Icon({ name, size = 18, className = "shrink-0 opacity-80" }: { name: string; size?: number; className?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    className,
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
    case "home":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5" />
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
    case "profile":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20a8 8 0 0 1 16 0" />
        </svg>
      );
    case "flag":
      return (
        <svg {...common}>
          <line x1="4" y1="22" x2="4" y2="2" />
          <path d="M4 4h13l-3 5 3 5H4" />
        </svg>
      );
    case "building":
      return (
        <svg {...common}>
          <rect x="4" y="2" width="16" height="20" rx="1" />
          <line x1="9" y1="6" x2="9" y2="6.01" />
          <line x1="15" y1="6" x2="15" y2="6.01" />
          <line x1="9" y1="10" x2="9" y2="10.01" />
          <line x1="15" y1="10" x2="15" y2="10.01" />
          <line x1="9" y1="14" x2="9" y2="14.01" />
          <line x1="15" y1="14" x2="15" y2="14.01" />
          <path d="M9 22v-4h6v4" />
        </svg>
      );
    case "sitemap":
      return (
        <svg {...common}>
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <rect x="3" y="17" width="6" height="4" rx="1" />
          <rect x="15" y="17" width="6" height="4" rx="1" />
          <path d="M12 7v4M6 11h12M6 11v6M18 11v6" />
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
  nav,
}: {
  fullname: string;
  role: string;
  photoUrl: string | null;
  nav: readonly NavSection[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Hovering the collapsed icon rail flies it out to the full menu without
  // touching the persisted `collapsed` preference — it snaps back the
  // moment the pointer leaves. Only collapsed has anything to peek from.
  const peek = collapsed && peeking;
  const showLabels = !collapsed || peek;
  const [alertCount, setAlertCount] = useState<number | null>(null);
  // Only the RH nav has a /contrats item — the alert-count endpoint is
  // HR-only anyway (403s otherwise), so skip the wasted call entirely.
  const hasAlertBadge = nav.some((section) => section.items.some((item) => item.href === "/contrats"));

  useEffect(() => {
    // Reads localStorage (unavailable during SSR) once after mount; SSR/first
    // paint always show expanded, matching the server render exactly, then
    // this flips to the persisted state — a deliberate hydration-safe
    // "flash of default" rather than a derivable/computable value. Default
    // for anyone with no stored preference yet is now collapsed (the icon
    // rail), freeing width for the tile-based /accueil portal — an explicit
    // "0" from before this change (someone who had expanded it) still wins.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) !== "0");
    } catch {}
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!hasAlertBadge) return;
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
    // Fixed-width spacer: reserves the *persisted* width in the flex layout
    // so hovering the collapsed rail (below) never reflows the main content
    // — the nav itself floats over it instead, as an overlay.
    <div className="relative h-full shrink-0" style={{ width: collapsed ? 68 : 220 }}>
      <nav
        onMouseEnter={() => collapsed && setPeeking(true)}
        onMouseLeave={() => setPeeking(false)}
        className={`absolute left-0 top-0 flex h-full flex-col bg-vd shadow-xl transition-[width] duration-200 ${
          showLabels ? "w-[220px]" : "w-[68px]"
        } ${peek ? "z-30" : "z-0"} ${mounted ? "" : "duration-0"}`}
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

      <div
        className="border-b border-white/10 bg-gradient-to-br from-v to-vd px-4 pb-2.5 pt-5"
      >
        <div className="truncate text-lg font-semibold tracking-tight text-white">
          {showLabels ? "Synelia RH" : "S"}
        </div>
        {showLabels && <div className="mt-0.5 text-[11px] font-light text-white/60">SIRH</div>}
      </div>

      <div
        className={`flex shrink-0 items-center border-b border-white/10 bg-black/10 py-3 ${
          showLabels ? "gap-2.5 px-4" : "justify-center px-2"
        }`}
      >
        <div title={showLabels ? undefined : `${fullname} — ${role}`}>
          <Avatar photoUrl={photoUrl} fullname={fullname} size={32} bg="bg-mg" />
        </div>
        {showLabels && (
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

      <div className="flex-1 overflow-y-auto px-2.5 py-4">
        {nav.map((section) => (
          <div key={section.section} className="mb-1">
            {showLabels && (
              <div className="px-2.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                {section.section}
              </div>
            )}
            {section.items.map((item) => {
              // Deux entrées (Évaluations / Mes objectifs) pointent vers la
              // même route avec un ?vue= différent — un simple startsWith
              // sur le pathname les allumerait toutes les deux à la fois,
              // donc on compare aussi la valeur de "vue" attendue par
              // chaque lien avec celle de l'URL actuelle.
              const [itemPath, itemQuery] = item.href.split("?");
              const itemVue = itemQuery ? new URLSearchParams(itemQuery).get("vue") : null;
              const active = pathname.startsWith(itemPath) && itemVue === searchParams.get("vue");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={showLabels ? undefined : item.label}
                  className={`relative mb-1 flex items-center rounded-lg py-2.5 text-[13px] transition-colors ${
                    showLabels ? "gap-3 px-3" : "justify-center px-0"
                  } ${
                    active
                      ? "bg-vm font-medium text-white shadow-sm"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {active && showLabels && (
                    <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-mg" />
                  )}
                  <Icon name={item.icon} />
                  {showLabels && <span>{item.label}</span>}
                  {item.href === "/contrats" &&
                    (alertCount === null ? (
                      <span
                        className={`animate-pulse rounded-full bg-white/15 ${
                          showLabels ? "ml-auto h-4 w-6" : "absolute right-1.5 top-1.5 h-2 w-2"
                        }`}
                      />
                    ) : (
                      alertCount > 0 &&
                      (showLabels ? (
                        <span className="ml-auto min-w-[18px] rounded-full bg-wn px-1.5 text-center text-[10px] font-semibold text-white">
                          {alertCount}
                        </span>
                      ) : (
                        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-wn" />
                      ))
                    ))}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      </nav>
    </div>
  );
}
