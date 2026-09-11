import type { Alerte } from "@/lib/format";

const ALERTE_STYLE: Record<Alerte, { bg: string; fg: string; label: string; dot: string }> = {
  ok: { bg: "#E6FAF4", fg: "#0A5C3A", label: "OK", dot: "#00C48C" },
  urgent: { bg: "#FFF0EC", fg: "#A0200A", label: "Urgent", dot: "#E63946" },
  attention: { bg: "#FFF8EC", fg: "#7A4A00", label: "Attention", dot: "#FF6B35" },
  expiré: { bg: "#FDECEA", fg: "#8B1A1A", label: "Expiré", dot: "#A0200A" },
  cdi: { bg: "#EEF0F8", fg: "#3A2A6A", label: "CDI / Indéterminé", dot: "#9A90A8" },
};

export function AlerteBadge({ alerte, jours }: { alerte: Alerte; jours?: number | null }) {
  const s = ALERTE_STYLE[alerte];
  const label =
    alerte === "cdi"
      ? s.label
      : alerte === "expiré"
        ? `Expiré${jours != null ? ` (${Math.abs(jours)}j)` : ""}`
        : jours != null
          ? `${s.label} (${jours}j)`
          : s.label;
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {label}
    </span>
  );
}

export function ContratBadge({ type }: { type: string }) {
  const key = type.toUpperCase();
  const style =
    key.includes("CDI") || key.includes("INDÉTERMIN") || key.includes("INDETERMIN")
      ? { bg: "#EEF0F8", fg: "#3A2A6A" }
      : key.includes("CDD")
        ? { bg: "#F0F8EE", fg: "#1A5A0A" }
        : key.includes("STAGE")
          ? { bg: "#FFF5E0", fg: "#7A5000" }
          : key.includes("CONSULT")
            ? { bg: "#EEF0F8", fg: "#3A2A6A" }
            : { bg: "#F5F5F5", fg: "#666" };
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: style.bg, color: style.fg }}
    >
      {type}
    </span>
  );
}

export function GenreBadge({ genre }: { genre: string }) {
  if (genre === "M")
    return (
      <span className="inline-flex rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[11px] font-semibold text-[#1A3A8A]">
        M
      </span>
    );
  if (genre === "F")
    return (
      <span className="inline-flex rounded-full bg-[#FDE8F5] px-2 py-0.5 text-[11px] font-semibold text-[#8A1A5A]">
        F
      </span>
    );
  return <span className="text-gm">—</span>;
}
