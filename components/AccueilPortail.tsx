import Link from "next/link";
import { Icon } from "@/components/Sidebar";

export interface AccueilTile {
  href: string;
  label: string;
  icon: string;
  /** Tailwind bg-* class for the icon chip — deliberately one distinct hue
   * per tile (like the existing dashboard QuickLinks) rather than the
   * charte's "one accent" rule: a launcher distinguishing modules is
   * closer to a data-viz legend than to a document. */
  color: string;
  value?: string;
  sub?: string;
}

/** The tile-based home portal — each module at a glance (icon, colour, key
 * figure) instead of scanning a text menu, freeing the sidebar to collapse
 * down to its icon rail by default. */
export function AccueilPortail({ tiles }: { tiles: AccueilTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="flex flex-col rounded-[18px] border border-v/10 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-[12px] text-white ${t.color}`}>
            <Icon name={t.icon} size={22} className="opacity-100" />
          </div>
          <div className="font-mono text-[26px] font-semibold leading-none text-nb">{t.value ?? " "}</div>
          <div className="mt-2 text-[13px] font-semibold text-nb">{t.label}</div>
          {t.sub && <div className="mt-0.5 text-[11px] text-gm">{t.sub}</div>}
        </Link>
      ))}
    </div>
  );
}
