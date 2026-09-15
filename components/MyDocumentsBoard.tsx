"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/format";
import { DocumentTypeBadge } from "@/components/Badge";

export type DocumentRequestStatut = "demandee" | "en_traitement" | "prete" | "remise" | "refusee";

export interface DocumentRequest {
  id: string;
  typeDocument: string;
  statut: DocumentRequestStatut;
  commentaire: string | null;
  filePath: string | null;
  createdAt: string;
}

// Même 14 types qu'exposés par lib/db.ts (dupliqués ici — ce fichier
// est server-only, inutilisable depuis ce composant client), regroupés
// par nature plutôt qu'en une seule liste plate de cases à cocher.
const DOCUMENT_CATEGORIES: { label: string; types: string[] }[] = [
  {
    label: "Attestations d'emploi",
    types: ["Attestation de travail", "Certificat de travail", "Attestation de stage", "Lettre de recommandation"],
  },
  {
    label: "Paie & rémunération",
    types: [
      "Bulletin de paie",
      "Attestation de salaire",
      "Solde de tout compte",
      "Attestation de versement d'honoraires",
      "Certificat/attestation de consultance",
    ],
  },
  {
    label: "Missions & déplacements",
    types: ["Ordre de mission", "Attestation de prise en charge"],
  },
  {
    label: "Autres démarches",
    types: ["Certificat médical", "Attestation CNPS", "Autre"],
  },
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
  const [destination, setDestination] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [objet, setObjet] = useState("");
  const [lieuNaissance, setLieuNaissance] = useState("");
  const [montantHonoraires, setMontantHonoraires] = useState("");
  const [dateSignatureContrat, setDateSignatureContrat] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsMission = typeDocuments.includes("Ordre de mission");
  const needsPriseEnCharge = typeDocuments.includes("Attestation de prise en charge");
  const needsHonoraires = typeDocuments.includes("Attestation de versement d'honoraires");

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
        body: JSON.stringify({
          typeDocuments,
          motif: motif.trim(),
          destination: destination || null,
          dateDebut: dateDebut || null,
          dateFin: dateFin || null,
          objet: objet || null,
          lieuNaissance: lieuNaissance || null,
          montantHonoraires: montantHonoraires ? Number(montantHonoraires) : null,
          dateSignatureContrat: dateSignatureContrat || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Échec");
      const { requests: created } = await res.json();
      setRequests((prev) => [...created, ...prev]);
      setTypeDocuments([]);
      setMotif("");
      setDestination("");
      setDateDebut("");
      setDateFin("");
      setObjet("");
      setLieuNaissance("");
      setMontantHonoraires("");
      setDateSignatureContrat("");
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
          <div className="flex flex-col gap-2.5 rounded-lg border border-v/15 bg-bg p-2">
            {DOCUMENT_CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-gm">
                  {cat.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {cat.types.map((t) => (
                    <label key={t} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white">
                      <input
                        type="checkbox"
                        checked={typeDocuments.includes(t)}
                        onChange={() => toggleType(t)}
                        className="accent-v"
                      />
                      <DocumentTypeBadge type={t} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {(needsMission || needsPriseEnCharge) && (
          <div className="flex flex-col gap-2 rounded-lg border border-v/15 bg-bg p-2.5">
            <div>
              <div className="mb-1 text-[11px] font-medium text-gm">
                {needsMission ? "Destination de la mission" : "Pays de destination"}
              </div>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-v"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-[11px] font-medium text-gm">
                  {needsMission ? "Date de départ" : "Début du séjour"}
                </div>
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-v"
                />
              </div>
              <div>
                <div className="mb-1 text-[11px] font-medium text-gm">
                  {needsMission ? "Date de retour" : "Fin du séjour"}
                </div>
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-v"
                />
              </div>
            </div>
            {needsMission && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-gm">Objet de la mission</div>
                <input
                  type="text"
                  value={objet}
                  onChange={(e) => setObjet(e.target.value)}
                  className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-v"
                />
              </div>
            )}
            {needsPriseEnCharge && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-gm">Lieu de naissance</div>
                <input
                  type="text"
                  value={lieuNaissance}
                  onChange={(e) => setLieuNaissance(e.target.value)}
                  className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-v"
                />
              </div>
            )}
          </div>
        )}

        {needsHonoraires && (
          <div className="flex flex-col gap-2 rounded-lg border border-v/15 bg-bg p-2.5">
            <div>
              <div className="mb-1 text-[11px] font-medium text-gm">Date de signature du contrat</div>
              <input
                type="date"
                value={dateSignatureContrat}
                onChange={(e) => setDateSignatureContrat(e.target.value)}
                className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-v"
              />
            </div>
            <div>
              <div className="mb-1 text-[11px] font-medium text-gm">Montant mensuel net (FCFA)</div>
              <input
                type="number"
                value={montantHonoraires}
                onChange={(e) => setMontantHonoraires(e.target.value)}
                placeholder="Laisser vide pour reprendre le salaire net Neos"
                className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-v"
              />
            </div>
          </div>
        )}

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
                  <td className="px-3.5 py-2.5">
                    <DocumentTypeBadge type={r.typeDocument} />
                  </td>
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
                    ) : (
                      <span className="text-gm">—</span>
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
