"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/format";

export type DocumentRequestStatut = "demandee" | "en_traitement" | "prete" | "remise" | "refusee";

export interface DocumentRequest {
  id: string;
  typeDocument: string;
  statut: DocumentRequestStatut;
  commentaire: string | null;
  filePath: string | null;
  createdAt: string;
}

const DOCUMENT_TYPES = [
  "Attestation de travail",
  "Bulletin de paie",
  "Certificat de travail",
  "Certificat/attestation de consultance",
  "Attestation de salaire",
  "Certificat médical",
  "Attestation de stage",
  "Attestation CNPS",
  "Solde de tout compte",
  "Lettre de recommandation",
  "Autre",
];

const STATUT_LABEL: Record<DocumentRequestStatut, { label: string; bg: string; fg: string }> = {
  demandee: { label: "Demandée", bg: "#EEF0F8", fg: "#3A2A6A" },
  en_traitement: { label: "En traitement", bg: "#FFF8EC", fg: "#7A4A00" },
  prete: { label: "Prête", bg: "#E8F4FD", fg: "#0C447C" },
  remise: { label: "Remise", bg: "#E6FAF4", fg: "#0A5C3A" },
  refusee: { label: "Refusée", bg: "#FDECEA", fg: "#8B1A1A" },
};

export function MyDocumentsBoard({
  initialRequests,
  dbEnabled,
}: {
  initialRequests: DocumentRequest[];
  dbEnabled: boolean;
}) {
  const [requests, setRequests] = useState<DocumentRequest[]>(initialRequests);
  const [typeDocuments, setTypeDocuments] = useState<string[]>([]);
  const [motif, setMotif] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleType(t: string) {
    setTypeDocuments((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (typeDocuments.length === 0) {
      setError("Sélectionnez au moins un document");
      return;
    }
    if (!motif.trim()) {
      setError("Le motif de la demande est requis");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/documents/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeDocuments, motif: motif.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Échec");
      const { requests: created } = await res.json();
      setRequests((prev) => [...created, ...prev]);
      setTypeDocuments([]);
      setMotif("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSaving(false);
    }
  }

  if (!dbEnabled) {
    return (
      <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center">
        <div className="mb-1 text-sm font-semibold text-nb">Fonctionnalité indisponible</div>
        <p className="mx-auto max-w-md text-xs text-gm">
          Le suivi des demandes de documents n&apos;est pas configuré pour le moment. Contactez la
          RH directement.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
      <form
        onSubmit={submit}
        className="flex h-fit flex-col gap-3 rounded-[14px] border border-v/10 bg-white p-4"
      >
        <div className="text-[13px] font-semibold">Nouvelle demande</div>
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-gm">
            Document(s) souhaité(s)
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-v/15 bg-bg p-2">
            {DOCUMENT_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-white">
                <input
                  type="checkbox"
                  checked={typeDocuments.includes(t)}
                  onChange={() => toggleType(t)}
                  className="accent-v"
                />
                {t}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-gm">Motif de la demande</div>
          <textarea
            placeholder="Ex : dossier bancaire, visa, stage…"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            rows={2}
            required
            className="w-full resize-none rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v"
          />
        </div>
        {error && <div className="text-xs text-er">{error}</div>}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-v py-2 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
        >
          {saving ? "Envoi…" : "+ Soumettre la demande"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-[14px] border border-v/10 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {["Document", "Demandée le", "Statut", "Fichier"].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const s = STATUT_LABEL[r.statut];
              return (
                <tr key={r.id} className="border-b border-v/5 last:border-none hover:bg-gl">
                  <td className="px-3.5 py-2.5 font-medium text-nb">{r.typeDocument}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-nb">{fmtDate(r.createdAt)}</td>
                  <td className="px-3.5 py-2.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: s.bg, color: s.fg }}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5">
                    {r.filePath ? (
                      <a
                        href={`/api/files/download?path=${encodeURIComponent(r.filePath)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-v hover:underline"
                      >
                        📎 Télécharger
                      </a>
                    ) : r.statut === "refusee" ? (
                      <span className="text-gm">—</span>
                    ) : (
                      <a
                        href={`/documents/${r.id}/generer`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gm hover:text-v hover:underline"
                      >
                        Aperçu
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3.5 py-8 text-center text-gm">
                  Vous n&apos;avez pas encore de demande.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
