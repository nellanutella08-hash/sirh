"use client";

import { useMemo, useState } from "react";
import { fmtDate } from "@/lib/format";

export type CongeAvisHierarchie = "en_attente" | "favorable" | "defavorable" | "changement_demande";
export type CongeRequestStatut = "demandee" | "validee" | "refusee";

export interface CongeRequest {
  id: string;
  motif: string;
  motifDetail: string | null;
  dateDebut: string;
  dateFin: string;
  jours: number;
  dateReprise: string | null;
  deduction: "conges_annuels" | "salaire";
  justificatifPath: string | null;
  avisHierarchie: CongeAvisHierarchie;
  avisHierarchieMotif: string | null;
  statut: CongeRequestStatut;
  createdAt: string;
}

const MOTIFS = [
  "Congés annuels",
  "Maladie non professionnelle",
  "Accident du travail / maladie professionnelle",
  "Maladie d'un proche",
  "Congé formation",
  "Permission exceptionnelle",
  "Congés maternité",
  "Permission non exceptionnelle",
];

// Motifs pour lesquels la fiche papier demande une précision (lien de
// parenté, nature exacte de la permission…) en plus du motif lui-même.
const MOTIF_DETAIL_LABEL: Record<string, string> = {
  "Maladie d'un proche": "Lien de parenté",
  "Permission exceptionnelle": "Précisez",
  "Permission non exceptionnelle": "Motif précis",
};

// La vue "collaborateur" combine avis hiérarchie + statut RH en une seule
// étape claire, plutôt que deux badges séparés à interpréter soi-même.
function etape(r: Pick<CongeRequest, "avisHierarchie" | "statut">): {
  label: string;
  bg: string;
  fg: string;
} {
  if (r.statut === "validee") return { label: "Validée", bg: "#E6FAF4", fg: "#0A5C3A" };
  if (r.statut === "refusee") return { label: "Refusée", bg: "#FDECEA", fg: "#8B1A1A" };
  if (r.avisHierarchie === "en_attente") {
    return { label: "En attente de l'avis du manager", bg: "#EEF0F8", fg: "#3A2A6A" };
  }
  if (r.avisHierarchie === "favorable") {
    return { label: "Avis favorable — en attente de la RH", bg: "#E8F4FD", fg: "#0C447C" };
  }
  if (r.avisHierarchie === "changement_demande") {
    return { label: "Changement de dates demandé — à vous de jouer", bg: "#FFF8EC", fg: "#7A4A00" };
  }
  return { label: "Avis défavorable — en attente de la RH", bg: "#FDECEA", fg: "#8B1A1A" };
}

function joursEntre(debut: string, fin: string): number {
  if (!debut || !fin) return 0;
  const j = Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 86_400_000) + 1;
  return j > 0 ? j : 0;
}

function lendemain(date: string): string {
  if (!date) return "";
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function MesCongesBoard({
  employe,
  initialRequests,
  solde,
  dbEnabled,
}: {
  employe: { fullname: string; fonction: string; entite: string; contractNumber: string | null };
  initialRequests: CongeRequest[];
  solde: number;
  dbEnabled: boolean;
}) {
  const [requests, setRequests] = useState<CongeRequest[]>(initialRequests);
  const [motif, setMotif] = useState(MOTIFS[0]);
  const [motifDetail, setMotifDetail] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [dateReprise, setDateReprise] = useState("");
  const [deduction, setDeduction] = useState<"conges_annuels" | "salaire">("conges_annuels");
  const [contactUrgenceNom, setContactUrgenceNom] = useState("");
  const [contactUrgenceLien, setContactUrgenceLien] = useState("");
  const [contactUrgenceNumero, setContactUrgenceNumero] = useState("");
  const [interimaires, setInterimaires] = useState("");
  const [justificatif, setJustificatif] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDateDebut, setEditDateDebut] = useState("");
  const [editDateFin, setEditDateFin] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const editJours = useMemo(() => joursEntre(editDateDebut, editDateFin), [editDateDebut, editDateFin]);

  function startEdit(r: CongeRequest) {
    setEditingId(r.id);
    setEditDateDebut(r.dateDebut.slice(0, 10));
    setEditDateFin(r.dateFin.slice(0, 10));
  }

  async function submitEdit(r: CongeRequest) {
    if (!editDateDebut || !editDateFin || editJours <= 0) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/conges/requests/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateDebut: editDateDebut, dateFin: editDateFin }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRequests((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
        setEditingId(null);
      }
    } finally {
      setEditSaving(false);
    }
  }

  const jours = useMemo(() => joursEntre(dateDebut, dateFin), [dateDebut, dateFin]);
  const detailLabel = MOTIF_DETAIL_LABEL[motif];

  function onDateFinChange(v: string) {
    setDateFin(v);
    if (v && !dateReprise) setDateReprise(lendemain(v));
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!dateDebut || !dateFin || jours <= 0) {
      setError("Sélectionnez des dates de début et de fin valides");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/conges/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motif,
          motifDetail: detailLabel ? motifDetail || null : null,
          dateDebut,
          dateFin,
          jours,
          dateReprise: dateReprise || null,
          deduction,
          contactUrgenceNom: contactUrgenceNom || null,
          contactUrgenceLien: contactUrgenceLien || null,
          contactUrgenceNumero: contactUrgenceNumero || null,
          interimaires: interimaires || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Échec");
      let created = await res.json();

      if (justificatif) {
        const body = new FormData();
        body.append("file", justificatif);
        const uploadRes = await fetch("/api/conges/upload", { method: "POST", body });
        if (uploadRes.ok) {
          const { pathname } = await uploadRes.json();
          const patchRes = await fetch(`/api/conges/requests/${created.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ justificatifPath: pathname }),
          });
          if (patchRes.ok) created = await patchRes.json();
        }
      }

      setRequests((prev) => [created, ...prev]);
      setMotifDetail("");
      setDateDebut("");
      setDateFin("");
      setDateReprise("");
      setContactUrgenceNom("");
      setContactUrgenceLien("");
      setContactUrgenceNumero("");
      setInterimaires("");
      setJustificatif(null);
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
          Le suivi des demandes de congés n&apos;est pas configuré pour le moment. Contactez la RH
          directement.
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v";

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
      <form onSubmit={submit} className="flex h-fit flex-col gap-3 rounded-[14px] border border-v/10 bg-white p-4">
        <div className="text-[13px] font-semibold">Nouvelle demande d&apos;absence</div>

        <div className="flex items-center justify-between rounded-lg bg-gradient-to-br from-sc to-v px-3 py-2.5">
          <span className="text-[11px] font-medium text-white/80">Solde de congés disponible</span>
          <span className="font-mono text-[15px] font-semibold text-white">{solde} j</span>
        </div>

        <div className="rounded-lg bg-gl px-3 py-2 text-[11px] text-gd">
          <div>
            <span className="font-medium">{employe.fullname}</span> — {employe.fonction}
          </div>
          <div className="text-gm">
            {employe.entite}
            {employe.contractNumber ? ` · N° contrat ${employe.contractNumber}` : ""}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium text-gm">Motif</div>
          <select value={motif} onChange={(e) => setMotif(e.target.value)} className={inputCls}>
            {MOTIFS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {detailLabel && (
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-gm">{detailLabel}</div>
            <input
              type="text"
              value={motifDetail}
              onChange={(e) => setMotifDetail(e.target.value)}
              className={inputCls}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-gm">Début</div>
            <input
              type="date"
              required
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-gm">Fin</div>
            <input
              type="date"
              required
              value={dateFin}
              onChange={(e) => onDateFinChange(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-gm">Jours</div>
            <div className="rounded-lg border border-v/15 bg-gl px-3 py-2 text-xs font-mono font-semibold text-v">
              {jours || "—"}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-gm">Reprise</div>
            <input
              type="date"
              value={dateReprise}
              onChange={(e) => setDateReprise(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium text-gm">Déduction</div>
          <div className="flex gap-3 text-xs text-nb">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={deduction === "conges_annuels"}
                onChange={() => setDeduction("conges_annuels")}
                className="accent-v"
              />
              Congés annuels
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={deduction === "salaire"}
                onChange={() => setDeduction("salaire")}
                className="accent-v"
              />
              Salaire
            </label>
          </div>
        </div>

        <div className="border-t border-v/10 pt-3">
          <div className="mb-2 text-[11px] font-semibold text-gd">En cas d&apos;urgence</div>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Nom du contact"
              value={contactUrgenceNom}
              onChange={(e) => setContactUrgenceNom(e.target.value)}
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Lien (père, conjoint…)"
                value={contactUrgenceLien}
                onChange={(e) => setContactUrgenceLien(e.target.value)}
                className={inputCls}
              />
              <input
                type="tel"
                placeholder="Numéro"
                value={contactUrgenceNumero}
                onChange={(e) => setContactUrgenceNumero(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium text-gm">
            Intérimaire(s) pendant l&apos;absence
          </div>
          <textarea
            placeholder="Nom, prénoms et email"
            value={interimaires}
            onChange={(e) => setInterimaires(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v"
          />
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium text-gm">Justificatif (optionnel)</div>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={(e) => setJustificatif(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-v/15 bg-bg px-2 py-1.5 text-[11px] file:mr-2 file:rounded-md file:border-none file:bg-v file:px-2 file:py-1 file:text-[11px] file:text-white"
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
              {["Motif", "Du", "Au", "Jours", "Justificatif", "Étape"].map((h) => (
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
              const e = etape(r);
              return (
                <tr key={r.id} className="border-b border-v/5 last:border-none hover:bg-gl">
                  <td className="px-3.5 py-2.5 font-medium text-nb">
                    {r.motif}
                    {r.motifDetail && <span className="text-gm"> — {r.motifDetail}</span>}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-nb">{fmtDate(r.dateDebut)}</td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-nb">{fmtDate(r.dateFin)}</td>
                  <td className="px-3.5 py-2.5 text-nb">{r.jours}</td>
                  <td className="px-3.5 py-2.5">
                    {r.justificatifPath ? (
                      <a
                        href={`/api/files/download?path=${encodeURIComponent(r.justificatifPath)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-v hover:underline"
                      >
                        📎 Voir
                      </a>
                    ) : (
                      <span className="text-gm">—</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">
                    <div className="flex flex-col gap-1">
                      <span
                        className="w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: e.bg, color: e.fg }}
                      >
                        {e.label}
                      </span>
                      {(r.avisHierarchie === "defavorable" || r.avisHierarchie === "changement_demande") &&
                        r.avisHierarchieMotif && (
                          <span className="text-[11px] text-gm">{r.avisHierarchieMotif}</span>
                        )}
                      {r.avisHierarchie === "changement_demande" &&
                        (editingId === r.id ? (
                          <div className="mt-1 flex flex-wrap items-end gap-1.5">
                            <div>
                              <div className="text-[10px] text-gm">Début</div>
                              <input
                                type="date"
                                value={editDateDebut}
                                onChange={(ev) => setEditDateDebut(ev.target.value)}
                                className="rounded-md border border-v/15 bg-bg px-2 py-1 text-[11px] outline-none focus:border-v"
                              />
                            </div>
                            <div>
                              <div className="text-[10px] text-gm">Fin</div>
                              <input
                                type="date"
                                value={editDateFin}
                                onChange={(ev) => setEditDateFin(ev.target.value)}
                                className="rounded-md border border-v/15 bg-bg px-2 py-1 text-[11px] outline-none focus:border-v"
                              />
                            </div>
                            <button
                              onClick={() => submitEdit(r)}
                              disabled={editSaving || editJours <= 0}
                              className="rounded-md bg-v px-2 py-1 text-[11px] font-medium text-white disabled:opacity-60"
                            >
                              Renvoyer
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded-md px-2 py-1 text-[11px] text-gm"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(r)}
                            className="mt-1 w-fit rounded-md bg-v px-2 py-1 text-[11px] font-medium text-white hover:bg-vm"
                          >
                            Modifier les dates
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3.5 py-8 text-center text-gm">
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
