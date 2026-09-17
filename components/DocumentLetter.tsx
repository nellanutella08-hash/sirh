"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Employe, Enterprise } from "@/lib/data";
import type { EntiteLegalInfo, DocumentRequest } from "@/lib/db";
import { buildLetterParagraphs, identiteParagraph } from "@/lib/documentTemplates";
import { DocumentLetterPreview, type SignatureMode } from "@/components/DocumentLetterPreview";

function civilite(genre: string): string {
  if (genre === "F") return "Madame";
  if (genre === "M") return "Monsieur";
  return "";
}

export type { SignatureMode };

/** The live document-generation flow: renders the letter from its
 * predefined model (lib/documentTemplates.ts) when one exists, always with
 * a "Modifier" toggle so RH can tweak the wording or add anything the
 * model doesn't cover before printing or sending — for a type with no
 * model at all, it starts directly in edit mode with just the legal
 * identity paragraph filled in, instead of handing over a blank page. */
export function DocumentLetter({
  typeDocument,
  employe,
  enterprise,
  legal,
  request,
  mode = "numerique",
  requestId,
  alreadySent,
}: {
  typeDocument: string;
  employe: Employe;
  enterprise: Enterprise;
  legal: EntiteLegalInfo | null;
  request?: DocumentRequest;
  mode?: SignatureMode;
  requestId: string;
  alreadySent: boolean;
}) {
  const router = useRouter();
  const built = buildLetterParagraphs(typeDocument, employe, enterprise, legal, request);
  const civ = civilite(employe.genre);
  const nomComplet = `${civ ? civ + " " : ""}${employe.fullname}`;

  const [title, setTitle] = useState(built?.title ?? typeDocument);
  const [paragraphs, setParagraphs] = useState<string[]>(
    built?.paragraphs ?? [
      identiteParagraph(enterprise, legal),
      `Concernant ${nomComplet} (${employe.fonction}) — texte à rédiger avant l'envoi.`,
    ]
  );
  const [editing, setEditing] = useState(built == null);
  const [signatureOffsetMm, setSignatureOffsetMm] = useState(0);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState<string | null>(null);

  function updateParagraph(index: number, value: string) {
    setParagraphs((prev) => prev.map((p, i) => (i === index ? value : p)));
  }
  function removeParagraph(index: number) {
    setParagraphs((prev) => prev.filter((_, i) => i !== index));
  }
  function addParagraph() {
    setParagraphs((prev) => [...prev, ""]);
  }

  async function send() {
    setSendStatus("sending");
    setSendError(null);
    try {
      const res = await fetch(`/api/documents/requests/${requestId}/envoyer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, paragraphs, signatureOffsetMm }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Échec de l'envoi");
      setSendStatus("sent");
      router.refresh();
    } catch (err) {
      setSendStatus("error");
      setSendError(err instanceof Error ? err.message : "Erreur inattendue");
    }
  }

  const sent = sendStatus === "sent" || alreadySent;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
            editing ? "bg-v text-white" : "border border-v/20 text-nb hover:bg-gl"
          }`}
        >
          {editing ? "✓ Terminer la modification" : "✏️ Modifier"}
        </button>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {sent && (
              <span className="rounded-lg bg-sc/15 px-3 py-2 text-sm font-medium text-[#0E7A50]">
                ✓ Envoyé au collaborateur
              </span>
            )}
            <button
              onClick={() => window.print()}
              className="rounded-lg bg-bg2 px-4 py-2 text-sm font-medium text-nb hover:bg-gl"
            >
              Imprimer / Enregistrer en PDF
            </button>
            {mode === "numerique" && (
              <button
                onClick={send}
                disabled={sendStatus === "sending"}
                className={
                  sent
                    ? "text-xs text-gm hover:text-v hover:underline"
                    : "rounded-lg bg-v px-4 py-2 text-sm font-medium text-white hover:bg-vm disabled:opacity-60"
                }
              >
                {sendStatus === "sending" ? "Envoi en cours…" : sent ? "Renvoyer" : "Envoyer au collaborateur"}
              </button>
            )}
          </div>
          {sendError && <div className="text-xs text-er">{sendError}</div>}
        </div>
      </div>

      {built == null && (
        <div className="mb-4 rounded-lg border border-wn/30 bg-[#FFF8EC] px-4 py-3 text-xs text-[#8F5500] print:hidden">
          Aucun modèle prédéfini pour « {typeDocument} » — texte de départ ci-dessous, à compléter via «
          Modifier » avant l&apos;envoi.
        </div>
      )}

      <div className="rounded-[14px] border border-v/10 bg-white p-12 print:w-[210mm] print:border-none print:p-[15mm] print:shadow-none">
        <DocumentLetterPreview
          typeDocument={typeDocument}
          enterprise={enterprise}
          legal={legal}
          mode={mode}
          title={title}
          paragraphs={paragraphs}
          editing={editing}
          onTitleChange={setTitle}
          onParagraphChange={updateParagraph}
          onRemoveParagraph={removeParagraph}
          onAddParagraph={addParagraph}
          signatureOffsetMm={signatureOffsetMm}
          onSignatureOffsetChange={setSignatureOffsetMm}
        />
      </div>
    </>
  );
}
