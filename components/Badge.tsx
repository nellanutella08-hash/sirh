import type { Alerte } from "@/lib/format";

const ALERTE_STYLE: Record<Alerte, { bg: string; fg: string; label: string; dot: string }> = {
  ok: { bg: "#E6FAF4", fg: "#0E7A50", label: "OK", dot: "#1FB980" },
  attention: { bg: "#FFF8EC", fg: "#8F5500", label: "Attention", dot: "#F5A623" },
  urgent: { bg: "#FFF0EC", fg: "#A0200A", label: "Urgent", dot: "#E5484D" },
  a_renouveler: { bg: "#FDE4E4", fg: "#C42B30", label: "À renouveler", dot: "#C0292E" },
  expiré: { bg: "#FDECEA", fg: "#C42B30", label: "Expiré", dot: "#A0200A" },
  cdi: { bg: "#EEF0F8", fg: "#3A2A6A", label: "CDI / Indéterminé", dot: "#928DA6" },
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

export function EnCongeBadge() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#FFF8EC] px-2 py-0.5 text-[11px] font-semibold text-[#8F5500]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#FF9F1C]" />
      En congés
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
          ? { bg: "#FFF5E0", fg: "#8F5500" }
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

export const DOCUMENT_TYPE_STYLE: Record<string, { bg: string; fg: string }> = {
  "Attestation de travail": { bg: "#EEF0F8", fg: "#3A2A6A" },
  "Attestation de prise en charge": { bg: "#E8F4FD", fg: "#0C447C" },
  "Ordre de mission": { bg: "#FFF0EC", fg: "#A0200A" },
  "Bulletin de paie": { bg: "#E6FAF4", fg: "#0E7A50" },
  "Certificat de travail": { bg: "#F1EEF8", fg: "#3A2A6A" },
  "Certificat/attestation de consultance": { bg: "#FFF5E0", fg: "#8F5500" },
  "Attestation de versement d'honoraires": { bg: "#FBEAF2", fg: "#A31556" },
  "Attestation de salaire": { bg: "#F0F8EE", fg: "#1A5A0A" },
  "Certificat médical": { bg: "#FDECEA", fg: "#C42B30" },
  "Attestation de stage": { bg: "#EAF7FB", fg: "#0B5566" },
  "Attestation CNPS": { bg: "#F5F0FF", fg: "#5B21B6" },
  "Solde de tout compte": { bg: "#FFF8EC", fg: "#8F5500" },
  "Lettre de recommandation": { bg: "#FDF0FA", fg: "#9B1B6E" },
};

export function documentTypeColors(type: string): { bg: string; fg: string } {
  return DOCUMENT_TYPE_STYLE[type] ?? { bg: "#F5F5F5", fg: "#666" };
}

export function DocumentTypeBadge({ type }: { type: string }) {
  const s = documentTypeColors(type);
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: s.bg, color: s.fg }}
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
