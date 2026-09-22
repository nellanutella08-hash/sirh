import Link from "next/link";

const VARIANT: Record<string, string> = {
  default: "text-v",
  danger: "text-er",
  warn: "text-wn",
  success: "text-sc",
  mag: "text-mg",
};

export function KpiCard({
  label,
  value,
  sub,
  variant = "default",
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  variant?: keyof typeof VARIANT;
  href?: string;
}) {
  const content = (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gm">{label}</span>
        {href && (
          <span className="text-[13px] text-v/30 transition-transform group-hover:translate-x-0.5 group-hover:text-v">
            →
          </span>
        )}
      </div>
      <div className={`font-mono text-[26px] font-semibold leading-none ${VARIANT[variant]}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-gm">{sub}</div>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group block rounded-[14px] border border-v/10 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-v/25 hover:shadow-[0_4px_14px_rgba(75,40,130,0.12)]"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-[14px] border border-v/10 bg-white p-4 transition-shadow hover:shadow-[0_2px_8px_rgba(75,40,130,0.08)]">
      {content}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  hasSearchBarAbove = true,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  /** The layout only renders the sticky GlobalSearch bar (h-14) above the
   * page for RH sessions — this sticks right below it there. A page a
   * collaborateur session can also reach (accueil, annuaire, organigramme,
   * mon-contrat…) has nothing above it in that case, so this must be false
   * there or the header sticks 56px too low and the content behind it
   * peeks out from under its top edge. Pass `isRH(session)` through. */
  hasSearchBarAbove?: boolean;
}) {
  return (
    <div
      className={`sticky z-10 flex items-center gap-4 border-b border-v/10 bg-white px-6 py-4 ${
        hasSearchBarAbove ? "top-14" : "top-0"
      }`}
    >
      <div>
        <div className="font-serif text-[16px] font-bold text-vd">{title}</div>
        {subtitle && <div className="mt-0.5 text-xs text-gm">{subtitle}</div>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
