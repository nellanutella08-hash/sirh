"use client";

import { useRouter } from "next/navigation";

/** Returns to wherever the user actually came from (Personnel → Par manager,
 * Organigramme, Trombinoscope, Contrats…) instead of a hardcoded destination
 * that always drops back to the same default page. Falls back to
 * `fallbackHref` only when there's no in-app history to go back to (direct
 * link, new tab). */
export function BackButton({
  fallbackHref,
  label = "← Retour",
  className = "rounded-lg border border-v/20 px-3 py-1.5 text-xs font-medium text-nb hover:bg-gl",
}: {
  fallbackHref: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className={className}
    >
      {label}
    </button>
  );
}
