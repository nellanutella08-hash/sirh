"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** One click: the server (see /api/documents/requests/[id]/envoyer) builds
 * the PDF straight from the request's data, attaches it, marks the request
 * "prête", and emails it to the collaborator with the PDF joined. Only
 * meant for "numérique" mode: a "papier" letter has blank space for a hand
 * signature/cachet and must go through the manual print → sign/tamponner →
 * scan → "+ Joindre" flow instead. */
export function SendDocumentButton({
  requestId,
  alreadySent,
}: {
  requestId: string;
  alreadySent: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch(`/api/documents/requests/${requestId}/envoyer`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Échec de l'envoi");
      setStatus("sent");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    }
  }

  const sent = status === "sent" || alreadySent;

  return (
    <div className="flex flex-col items-end gap-1 print:hidden">
      <div className="flex items-center gap-2">
        {sent && (
          <span className="rounded-lg bg-sc/15 px-3 py-2 text-sm font-medium text-[#0A5C3A]">
            ✓ Envoyé au collaborateur
          </span>
        )}
        <button
          onClick={send}
          disabled={status === "sending"}
          className={
            sent
              ? "text-xs text-gm hover:text-v hover:underline"
              : "rounded-lg bg-v px-4 py-2 text-sm font-medium text-white hover:bg-vm disabled:opacity-60"
          }
        >
          {status === "sending" ? "Envoi en cours…" : sent ? "Renvoyer" : "Envoyer au collaborateur"}
        </button>
      </div>
      {error && <div className="text-xs text-er">{error}</div>}
    </div>
  );
}
