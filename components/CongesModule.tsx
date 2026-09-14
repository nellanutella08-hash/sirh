"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate, isStagiaire, isConsultant } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { PermissionsExceptionnellesInfo } from "@/components/PermissionsExceptionnellesInfo";

export interface CongeEmploye {
  id: number;
  fullname: string;
  entite: string;
  contratType: string;
  dateEntree: string | null;
  photoUrl: string | null;
}

export type CongeAvisHierarchie = "en_attente" | "favorable" | "defavorable" | "changement_demande";
export type CongeRequestStatut = "demandee" | "validee" | "refusee";

export interface CongeRequest {
  id: string;
  employeId: number;
  employeNom: string;
  motif: string;
  motifDetail: string | null;
  dateDebut: string;
  dateFin: string;
  jours: number;
  motif2: string | null;
  motifDetail2: string | null;
  dateDebut2: string | null;
  dateFin2: string | null;
  jours2: number | null;
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

const MOTIF_DETAIL_LABEL: Record<string, string> = {
  "Maladie d'un proche": "Lien de parenté",
  "Permission exceptionnelle": "Précisez",
  "Permission non exceptionnelle": "Motif précis",
};

const AVIS_LABEL: Record<CongeAvisHierarchie, { label: string; bg: string; fg: string }> = {
  en_attente: { label: "En attente", bg: "#EEF0F8", fg: "#3A2A6A" },
  favorable: { label: "Favorable", bg: "#E6FAF4", fg: "#0A5C3A" },
  defavorable: { label: "Défavorable", bg: "#FDECEA", fg: "#8B1A1A" },
  changement_demande: { label: "Changement de dates demandé", bg: "#FFF8EC", fg: "#7A4A00" },
};

const STATUT_LABEL: Record<CongeRequestStatut, { label: string; bg: string; fg: string }> = {
  demandee: { label: "Demandée", bg: "#EEF0F8", fg: "#3A2A6A" },
  validee: { label: "Validée", bg: "#E6FAF4", fg: "#0A5C3A" },
  refusee: { label: "Refusée", bg: "#FDECEA", fg: "#8B1A1A" },
};

function eligibilite(
  contratType: string
): { label: string; tag: string; eligible: boolean; editable: boolean } {
  if (isStagiaire(contratType)) {
    return { label: "Stagiaire (0j fixe)", tag: "bg-[#F1EEF8] text-[#3A2A6A]", eligible: true, editable: false };
  }
  if (isConsultant(contratType)) {
    return {
      label: "Consultant (non cumulable N+1)",
      tag: "bg-[#FFF5E0] text-[#7A5000]",
      eligible: true,
      editable: true,
    };
  }
  return { label: "CDI / CDD", tag: "bg-[#E8F4FD] text-[#0C447C]", eligible: true, editable: true };
}

function joursEntre(debut: string, fin: string): number {
  if (!debut || !fin) return 0;
  const j = Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 86_400_000) + 1;
  return j > 0 ? j : 0;
}

export function CongesModule({
  employes,
  initialRequests,
  initialSoldes,
  dbEnabled,
  initialTab,
  highlightRequestId,
}: {
  employes: CongeEmploye[];
  initialRequests: CongeRequest[];
  initialSoldes: Record<number, number>;
  dbEnabled: boolean;
  initialTab?: "soldes" | "demandes" | "saisie";
  highlightRequestId?: string;
}) {
  const [tab, setTab] = useState<"soldes" | "demandes" | "saisie">(initialTab ?? "soldes");
  const [soldes, setSoldes] = useState<Record<number, number>>(initialSoldes);
  const [savingSolde, setSavingSolde] = useState<number | null>(null);
  const [requests, setRequests] = useState<CongeRequest[]>(initialRequests);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employeId, setEmployeId] = useState("");
  const [motif, setMotif] = useState(MOTIFS[0]);
  const [motifDetail, setMotifDetail] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [addSecond, setAddSecond] = useState(false);
  const [motif2, setMotif2] = useState(MOTIFS[0]);
  const [motifDetail2, setMotifDetail2] = useState("");
  const [dateDebut2, setDateDebut2] = useState("");
  const [dateFin2, setDateFin2] = useState("");
  const detailLabel = MOTIF_DETAIL_LABEL[motif];
  const detailLabel2 = MOTIF_DETAIL_LABEL[motif2];
  const jours = useMemo(() => joursEntre(dateDebut, dateFin), [dateDebut, dateFin]);
  const jours2 = useMemo(() => joursEntre(dateDebut2, dateFin2), [dateDebut2, dateFin2]);

  const eligibles = useMemo(() => employes.filter((e) => eligibilite(e.contratType).eligible), [employes]);
  const saisissables = useMemo(() => employes.filter((e) => eligibilite(e.contratType).editable), [employes]);

  useEffect(() => {
    if (!highlightRequestId || tab !== "demandes") return;
    document.getElementById(`conge-${highlightRequestId}`)?.scrollIntoView({ block: "center" });
  }, [highlightRequestId, tab]);

  function joursPris(empId: number): number {
    return requests
      .filter((r) => r.employeId === empId && r.statut === "validee")
      .reduce((s, r) => s + r.jours, 0);
  }

  async function saveSolde(employeId: number, solde: number) {
    setSoldes((prev) => ({ ...prev, [employeId]: solde }));
    setSavingSolde(employeId);
    try {
      await fetch("/api/conges/soldes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeId, solde }),
      });
    } finally {
      setSavingSolde((cur) => (cur === employeId ? null : cur));
    }
  }

  async function submitDemande(ev: React.FormEvent) {
    ev.preventDefault();
    const emp = employes.find((e) => String(e.id) === employeId);
    if (!emp) {
      setError("Sélectionnez un collaborateur");
      return;
    }
    if (jours <= 0) {
      setError("Sélectionnez des dates de début et de fin valides");
      return;
    }
    if (addSecond && jours2 <= 0) {
      setError("Sélectionnez des dates valides pour la deuxième période");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/conges/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeId: emp.id,
          employeNom: emp.fullname,
          motif,
          motifDetail: detailLabel ? motifDetail || null : null,
          dateDebut,
          dateFin,
          jours,
          motif2: addSecond ? motif2 : null,
          motifDetail2: addSecond && detailLabel2 ? motifDetail2 || null : null,
          dateDebut2: addSecond ? dateDebut2 : null,
          dateFin2: addSecond ? dateFin2 : null,
          jours2: addSecond ? jours2 : null,
          deduction: "conges_annuels",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Échec");
      const created = await res.json();
      setRequests((prev) => [created, ...prev]);
      setShowForm(false);
      setEmployeId("");
      setMotifDetail("");
      setDateDebut("");
      setDateFin("");
      setAddSecond(false);
      setMotifDetail2("");
      setDateDebut2("");
      setDateFin2("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSaving(false);
    }
  }

  async function patchRequest(r: CongeRequest, patch: Record<string, unknown>) {
    const res = await fetch(`/api/conges/requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = await res.json();
      setRequests((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    }
  }

  async function setAvis(
    r: CongeRequest,
    avisHierarchie: "favorable" | "defavorable" | "changement_demande"
  ) {
    let avisHierarchieMotif: string | null = null;
    if (avisHierarchie === "defavorable") {
      const motif = window.prompt("Motif de l'avis défavorable (visible par le collaborateur) :");
      if (motif === null) return;
      avisHierarchieMotif = motif.trim() || null;
    } else if (avisHierarchie === "changement_demande") {
      const motif = window.prompt("Qu'attendez-vous du collaborateur (dates à changer, pourquoi) ?");
      if (motif === null) return;
      if (!motif.trim()) {
        alert("Précisez ce qui doit changer.");
        return;
      }
      avisHierarchieMotif = motif.trim();
    }
    await patchRequest(r, { avisHierarchie, avisHierarchieMotif });
  }

  async function removeRequest(r: CongeRequest) {
    if (!confirm(`Supprimer la demande "${r.motif}" de ${r.employeNom} ?`)) return;
    const res = await fetch(`/api/conges/requests/${r.id}`, { method: "DELETE" });
    if (res.ok) setRequests((prev) => prev.filter((x) => x.id !== r.id));
  }

  const kpis = {
    demandesEnAttente: requests.filter((r) => r.statut === "demandee").length,
    validees: requests.filter((r) => r.statut === "validee").length,
    refusees: requests.filter((r) => r.statut === "refusee").length,
    eligibles: eligibles.length,
    soldeMoyen: eligibles.length
      ? Math.round((eligibles.reduce((s, e) => s + (soldes[e.id] ?? 0), 0) / eligibles.length) * 10) / 10
      : 0,
  };

  return (
    <>
      <div className="mb-3 rounded-lg border border-v/10 bg-gl px-4 py-2.5 text-xs text-gd">
        Les soldes que vous saisissez ci-dessous (onglet « Saisie ») sont ensuite incrémentés
        automatiquement de +2,5 jours à la fin de chaque mois. Pour les CDI/CDD, sans plafond. Pour
        les consultants, non reporté sur l&apos;année suivante (repart de 0 chaque 1er janvier), sauf
        après 1 an d&apos;ancienneté où ils passent à 30j dès le 1er janvier. Les stagiaires restent à
        0j (non éditable).
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Éligibles" value={kpis.eligibles} />
        <Kpi label="Solde moyen (j)" value={kpis.soldeMoyen} />
        <Kpi label="Demandes en attente" value={kpis.demandesEnAttente} variant="warn" />
        <Kpi label="Validées" value={kpis.validees} variant="success" />
        <Kpi label="Refusées" value={kpis.refusees} variant="danger" />
      </div>

      <div className="mb-5 flex w-fit gap-0.5 rounded-[10px] bg-bg2 p-1">
        {[
          { key: "soldes", label: "Soldes congés" },
          { key: "demandes", label: "Demandes & Approbations" },
          { key: "saisie", label: "Saisie soldes CDI/CDD/Consultants" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${
              tab === t.key ? "bg-white text-v shadow-sm" : "text-gm hover:text-nb"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "soldes" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {eligibles.map((e) => {
            const solde = soldes[e.id] ?? 0;
            const elig = eligibilite(e.contratType);
            const pct = Math.max(0, Math.min(100, (solde / 30) * 100));
            return (
              <div key={e.id} className="rounded-[14px] border border-v/10 bg-white p-3.5">
                <div className="mb-2.5 flex items-center gap-2.5">
                  <Avatar photoUrl={e.photoUrl} fullname={e.fullname} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium leading-tight">{e.fullname}</div>
                    <div className="text-[11px] text-gm">{e.entite}</div>
                  </div>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${elig.tag}`}>
                    {elig.label}
                  </span>
                </div>
                <Row label="Pris (validé)" value={`${joursPris(e.id)} j`} />
                <div className="mt-1 flex justify-between text-xs">
                  <span className="text-gm">Solde disponible</span>
                  <span className="font-mono font-semibold text-v">{solde} j</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg2">
                  <div
                    className="h-full rounded-full bg-v transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "demandes" &&
        (!dbEnabled ? (
          <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center">
            <div className="mb-1 text-sm font-semibold text-nb">Base de données non configurée</div>
            <p className="mx-auto max-w-md text-xs text-gm">
              Les demandes de congés ont besoin d&apos;une base Postgres (Neon) — ajoutez{" "}
              <code>DATABASE_URL</code> dans les variables d&apos;environnement du projet.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex justify-end">
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
                    {["Collaborateur", "Motif", "Du", "Au", "Jours", "Justificatif", "Avis hiérarchie", "Statut", "Actions"].map(
                      (h) => (
                        <th
                          key={h}
                          className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gd"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const avis = AVIS_LABEL[r.avisHierarchie];
                    const s = STATUT_LABEL[r.statut];
                    const highlighted = r.id === highlightRequestId;
                    return (
                      <tr
                        key={r.id}
                        id={`conge-${r.id}`}
                        className={`border-b border-v/5 last:border-none hover:bg-gl ${
                          highlighted ? "bg-[#FFF8EC] ring-1 ring-inset ring-wn/40" : ""
                        }`}
                      >
                        <td className="px-3 py-2 font-medium">{r.employeNom}</td>
                        <td className="px-3 py-2">
                          {r.motif}
                          {r.motifDetail && <span className="text-gm"> — {r.motifDetail}</span>}
                          {r.motif2 && (
                            <div className="mt-0.5 text-[11px] text-gm">
                              + {r.motif2}
                              {r.motifDetail2 && ` — ${r.motifDetail2}`} ({fmtDate(r.dateDebut2)} au{" "}
                              {fmtDate(r.dateFin2)}, {r.jours2}j)
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">{fmtDate(r.dateDebut)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{fmtDate(r.dateFin)}</td>
                        <td className="px-3 py-2">{r.jours}</td>
                        <td className="px-3 py-2">
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
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={{ background: avis.bg, color: avis.fg }}
                            >
                              {avis.label}
                            </span>
                            {r.avisHierarchieMotif && (
                              <span className="text-[11px] text-gm">{r.avisHierarchieMotif}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ background: s.bg, color: s.fg }}
                          >
                            {s.label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            {r.avisHierarchie === "en_attente" && (
                              <>
                                <button
                                  onClick={() => setAvis(r, "favorable")}
                                  className="rounded-md bg-sc/15 px-2 py-1 text-[11px] font-medium text-[#0A5C3A]"
                                >
                                  Avis favorable
                                </button>
                                <button
                                  onClick={() => setAvis(r, "defavorable")}
                                  className="rounded-md bg-er/15 px-2 py-1 text-[11px] font-medium text-er"
                                >
                                  Avis défavorable
                                </button>
                                <button
                                  onClick={() => setAvis(r, "changement_demande")}
                                  className="rounded-md bg-wn/15 px-2 py-1 text-[11px] font-medium text-[#7A4A00]"
                                >
                                  Changer les dates
                                </button>
                              </>
                            )}
                            {r.avisHierarchie !== "en_attente" &&
                              r.avisHierarchie !== "changement_demande" &&
                              r.statut === "demandee" && (
                              <>
                                <button
                                  onClick={() => patchRequest(r, { statut: "validee" })}
                                  className="rounded-md bg-sc/15 px-2 py-1 text-[11px] font-medium text-[#0A5C3A]"
                                >
                                  Viser (valider)
                                </button>
                                <button
                                  onClick={() => patchRequest(r, { statut: "refusee" })}
                                  className="rounded-md bg-er/15 px-2 py-1 text-[11px] font-medium text-er"
                                >
                                  Refuser
                                </button>
                              </>
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
                  {requests.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-gm">
                        Aucune demande pour le moment.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ))}

      {tab === "saisie" && (
        <div className="overflow-x-auto rounded-[14px] border border-v/10 bg-white">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-bg">
                {["Collaborateur", "Entité", "Contrat", "Solde initial (j)"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {saisissables.map((e) => (
                <tr key={e.id} className="border-b border-v/5 last:border-none hover:bg-gl">
                  <td className="px-3 py-2 font-medium">{e.fullname}</td>
                  <td className="px-3 py-2">{e.entite}</td>
                  <td className="px-3 py-2">{e.contratType}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.5"
                      value={soldes[e.id] ?? 0}
                      onChange={(ev) =>
                        setSoldes((prev) => ({ ...prev, [e.id]: Number(ev.target.value) }))
                      }
                      onBlur={(ev) => saveSolde(e.id, Number(ev.target.value))}
                      className="w-20 rounded-md border-none bg-bg px-2 py-1 text-center font-mono font-semibold text-v outline-none focus:bg-gl focus:ring-2 focus:ring-v"
                    />
                    {savingSolde === e.id && <span className="ml-2 text-[10px] text-gm">…</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-vd/50 p-4"
          onClick={() => setShowForm(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitDemande}
            className="w-full max-w-md rounded-[14px] bg-white p-5"
          >
            <div className="mb-4 text-sm font-semibold text-nb">Nouvelle demande d&apos;absence</div>
            <div className="flex flex-col gap-3">
              <select
                required
                value={employeId}
                onChange={(e) => setEmployeId(e.target.value)}
                className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              >
                <option value="">Collaborateur…</option>
                {employes.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullname}
                  </option>
                ))}
              </select>
              <select
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              >
                {MOTIFS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              {motif === "Permission exceptionnelle" && <PermissionsExceptionnellesInfo />}
              {detailLabel && (
                <input
                  type="text"
                  placeholder={detailLabel}
                  value={motifDetail}
                  onChange={(e) => setMotifDetail(e.target.value)}
                  className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
                />
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  required
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
                />
                <input
                  type="date"
                  required
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
                />
              </div>
              {jours > 0 && <div className="text-xs text-gm">{jours} jour(s)</div>}

              <label className="flex items-center gap-1.5 border-t border-v/10 pt-3 text-[11px] font-medium text-gm">
                <input
                  type="checkbox"
                  checked={addSecond}
                  onChange={(e) => setAddSecond(e.target.checked)}
                  className="accent-v"
                />
                Combiner avec un deuxième motif / une deuxième période
              </label>

              {addSecond && (
                <div className="flex flex-col gap-2 rounded-lg border border-v/15 bg-bg p-2.5">
                  <select
                    value={motif2}
                    onChange={(e) => setMotif2(e.target.value)}
                    className="rounded-lg border border-v/15 bg-white px-3 py-2 text-sm outline-none focus:border-v"
                  >
                    {MOTIFS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {motif2 === "Permission exceptionnelle" && <PermissionsExceptionnellesInfo />}
                  {detailLabel2 && (
                    <input
                      type="text"
                      placeholder={detailLabel2}
                      value={motifDetail2}
                      onChange={(e) => setMotifDetail2(e.target.value)}
                      className="rounded-lg border border-v/15 bg-white px-3 py-2 text-sm outline-none focus:border-v"
                    />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={dateDebut2}
                      onChange={(e) => setDateDebut2(e.target.value)}
                      className="rounded-lg border border-v/15 bg-white px-3 py-2 text-sm outline-none focus:border-v"
                    />
                    <input
                      type="date"
                      value={dateFin2}
                      onChange={(e) => setDateFin2(e.target.value)}
                      className="rounded-lg border border-v/15 bg-white px-3 py-2 text-sm outline-none focus:border-v"
                    />
                  </div>
                  {jours2 > 0 && <div className="text-xs text-gm">{jours2} jour(s)</div>}
                </div>
              )}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gm">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function Kpi({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: "warn" | "success" | "danger";
}) {
  const color =
    variant === "warn"
      ? "text-wn"
      : variant === "success"
        ? "text-sc"
        : variant === "danger"
          ? "text-er"
          : "text-v";
  return (
    <div className="rounded-[14px] border border-v/10 bg-white p-3.5">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gm">{label}</div>
      <div className={`font-mono text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
