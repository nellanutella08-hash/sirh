"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/format";
import { DocumentTypeBadge } from "@/components/Badge";

export type DocumentRequestStatut = "demandee" | "en_traitement" | "prete" | "remise" | "refusee";

export interface DocumentRequest {
  id: string;
  employeId: number;
  employeNom: string;
  typeDocument: string;
  statut: DocumentRequestStatut;
  commentaire: string | null;
  filePath: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EmployeOption {
  id: number;
  fullname: string;
  entite: string;
  fonction: string;
}

const DOCUMENT_TYPES = [
  "Attestation de travail",
  "Attestation de prise en charge",
  "Ordre de mission",
  "Bulletin de paie",
  "Certificat de travail",
  "Certificat/attestation de consultance",
  "Attestation de versement d'honoraires",
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

const TABS: { key: DocumentRequestStatut | ""; label: string }[] = [
  { key: "", label: "Toutes" },
  { key: "demandee", label: "Demandées" },
  { key: "en_traitement", label: "En traitement" },
  { key: "prete", label: "Prêtes" },
  { key: "remise", label: "Remises" },
];

export function DocumentsBoard({
  initialRequests,
  dbEnabled,
}: {
  initialRequests: DocumentRequest[];
  dbEnabled: boolean;
}) {
  const [requests, setRequests] = useState<DocumentRequest[]>(initialRequests);
  const [tab, setTab] = useState<DocumentRequestStatut | "">("");
  const [employes, setEmployes] = useState<EmployeOption[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employeId, setEmployeId] = useState("");
  const [typeDocuments, setTypeDocuments] = useState<string[]>([]);
  const [motif, setMotif] = useState("");
  const [destination, setDestination] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [objet, setObjet] = useState("");
  const [lieuNaissance, setLieuNaissance] = useState("");
  const [montantHonoraires, setMontantHonoraires] = useState("");
  const [dateSignatureContrat, setDateSignatureContrat] = useState("");

  const needsMission = typeDocuments.includes("Ordre de mission");
  const needsPriseEnCharge = typeDocuments.includes("Attestation de prise en charge");
  const needsHonoraires = typeDocuments.includes("Attestation de versement d'honoraires");

  function toggleType(t: string) {
    setTypeDocuments((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  useEffect(() => {
    fetch("/api/search/index")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setEmployes(data))
      .catch(() => {});
  }, []);

  const filtered = useMemo(
    () => (tab ? requests.filter((r) => r.statut === tab) : requests),
    [requests, tab]
  );

  async function setStatut(r: DocumentRequest, statut: DocumentRequestStatut) {
    const res = await fetch(`/api/documents/requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRequests((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    }
  }

  async function attachFile(r: DocumentRequest, file: File) {
    const body = new FormData();
    body.append("file", file);
    const uploadRes = await fetch("/api/documents/upload", { method: "POST", body });
    if (!uploadRes.ok) return;
    const { pathname } = await uploadRes.json();
    const res = await fetch(`/api/documents/requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: pathname, statut: "prete" }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRequests((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    }
  }

  async function removeRequest(r: DocumentRequest) {
    if (!confirm(`Supprimer la demande "${r.typeDocument}" de ${r.employeNom} ?`)) return;
    const res = await fetch(`/api/documents/requests/${r.id}`, { method: "DELETE" });
    if (res.ok) setRequests((prev) => prev.filter((x) => x.id !== r.id));
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const emp = employes?.find((e) => String(e.id) === employeId);
    if (!emp) {
      setError("Sélectionnez un collaborateur");
      return;
    }
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
          employeId: emp.id,
          employeNom: emp.fullname,
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
      setShowForm(false);
      setEmployeId("");
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
        <div className="mb-1 text-sm font-semibold text-nb">Base de données non configurée</div>
        <p className="mx-auto max-w-md text-xs text-gm">
          Les demandes de documents ont besoin d&apos;une base Postgres (Neon) — Neos ne fournit
          aucune ressource de ce type. Ajoutez <code>DATABASE_URL</code> dans les variables
          d&apos;environnement du projet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-0.5 rounded-[10px] bg-bg2 p-1">
          {TABS.map((t) => (
            <button
              key={t.key || "all"}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                tab === t.key ? "bg-white text-v shadow-sm" : "text-gm hover:text-nb"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm"
        >
          + Nouvelle demande
        </button>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-v/10 bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-bg">
              {["Collaborateur", "Document", "Motif", "Demandée le", "Statut", "Fichier", "Actions"].map(
                (h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const s = STATUT_LABEL[r.statut];
              return (
                <tr key={r.id} className="border-b border-v/5 last:border-none hover:bg-gl">
                  <td className="px-3.5 py-2.5 font-medium text-nb">{r.employeNom}</td>
                  <td className="px-3.5 py-2.5">
                    <DocumentTypeBadge type={r.typeDocument} />
                  </td>
                  <td className="max-w-[220px] truncate px-3.5 py-2.5 text-nb" title={r.commentaire ?? undefined}>
                    {r.commentaire || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-nb">
                    {fmtDate(r.createdAt)}
                  </td>
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
                      <div className="flex items-center gap-2">
                        <a
                          href={`/documents/${r.id}/generer`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-v hover:underline"
                        >
                          Générer
                        </a>
                        <span className="text-gm">·</span>
                        <label className="cursor-pointer text-gm hover:text-v hover:underline">
                          + Joindre
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) attachFile(r, f);
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {r.statut === "demandee" && (
                        <button
                          onClick={() => setStatut(r, "en_traitement")}
                          className="rounded-md bg-bg2 px-2 py-1 text-[11px] font-medium text-gd"
                        >
                          Traiter
                        </button>
                      )}
                      {r.statut === "prete" && (
                        <button
                          onClick={() => setStatut(r, "remise")}
                          className="rounded-md bg-sc/15 px-2 py-1 text-[11px] font-medium text-[#0A5C3A]"
                        >
                          Marquer remise
                        </button>
                      )}
                      {(r.statut === "demandee" || r.statut === "en_traitement") && (
                        <button
                          onClick={() => setStatut(r, "refusee")}
                          className="rounded-md bg-er/15 px-2 py-1 text-[11px] font-medium text-er"
                        >
                          Refuser
                        </button>
                      )}
                      <button
                        onClick={() => removeRequest(r)}
                        className="rounded-md border border-v/15 px-2 py-1 text-[11px] text-gm"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3.5 py-8 text-center text-gm">
                  Aucune demande dans cette catégorie.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-vd/50 p-4"
          onClick={() => setShowForm(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-md rounded-[14px] bg-white p-5"
          >
            <div className="mb-4 text-sm font-semibold text-nb">Nouvelle demande de document</div>
            <div className="flex flex-col gap-3">
              <select
                required
                value={employeId}
                onChange={(e) => setEmployeId(e.target.value)}
                className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              >
                <option value="">Collaborateur…</option>
                {employes?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullname} — {e.fonction}
                  </option>
                ))}
              </select>
              <div>
                <div className="mb-1.5 text-[11px] font-medium text-gm">Document(s)</div>
                <div className="flex max-h-36 flex-col gap-1 overflow-y-auto rounded-lg border border-v/15 bg-bg p-2">
                  {DOCUMENT_TYPES.map((t) => (
                    <label
                      key={t}
                      className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white"
                    >
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
                      className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-v"
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
                        className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-v"
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
                        className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-v"
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
                        className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-v"
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
                        className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-v"
                      />
                    </div>
                  )}
                </div>
              )}

              {needsHonoraires && (
                <div className="flex flex-col gap-2 rounded-lg border border-v/15 bg-bg p-2.5">
                  <div>
                    <div className="mb-1 text-[11px] font-medium text-gm">
                      Date de signature du contrat
                    </div>
                    <input
                      type="date"
                      value={dateSignatureContrat}
                      onChange={(e) => setDateSignatureContrat(e.target.value)}
                      className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-v"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-medium text-gm">Montant mensuel net (FCFA)</div>
                    <input
                      type="number"
                      value={montantHonoraires}
                      onChange={(e) => setMontantHonoraires(e.target.value)}
                      placeholder="Laisser vide pour reprendre le salaire net Neos"
                      className="w-full rounded-lg border border-v/15 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-v"
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
                  className="w-full resize-none rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
                />
              </div>
            </div>

            {error && <div className="mt-3 text-xs text-er">{error}</div>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-v/20 px-3.5 py-1.5 text-xs font-medium text-nb hover:bg-gl"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
              >
                {saving ? "Envoi…" : "Créer la demande"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
