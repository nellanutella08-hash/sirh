"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/format";

export type CongeAvisHierarchie = "en_attente" | "favorable" | "defavorable" | "changement_demande";
export type CongeRequestStatut = "demandee" | "validee" | "refusee";

export interface CongeRequest {
  id: string;
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
  justificatifPath: string | null;
  avisHierarchie: CongeAvisHierarchie;
  avisHierarchieMotif: string | null;
  statut: CongeRequestStatut;
  createdAt: string;
}

const AVIS_LABEL: Record<CongeAvisHierarchie, { label: string; bg: string; fg: string }> = {
  en_attente: { label: "En attente", bg: "#EEF0F8", fg: "#3A2A6A" },
  favorable: { label: "Favorable", bg: "#E6FAF4", fg: "#0E7A50" },
  defavorable: { label: "Défavorable", bg: "#FDECEA", fg: "#C42B30" },
  changement_demande: { label: "Changement de dates demandé", bg: "#FFF8EC", fg: "#8F5500" },
};

const STATUT_LABEL: Record<CongeRequestStatut, { label: string; bg: string; fg: string }> = {
  demandee: { label: "Demandée", bg: "#EEF0F8", fg: "#3A2A6A" },
  validee: { label: "Validée", bg: "#E6FAF4", fg: "#0E7A50" },
  refusee: { label: "Refusée", bg: "#FDECEA", fg: "#C42B30" },
};

export function ValidationsCongesBoard({ initialRequests }: { initialRequests: CongeRequest[] }) {
  const [requests, setRequests] = useState<CongeRequest[]>(initialRequests);

  async function setAvis(
    r: CongeRequest,
    avisHierarchie: "favorable" | "defavorable" | "changement_demande"
  ) {
    let avisHierarchieMotif: string | null = null;
    if (avisHierarchie === "defavorable") {
      const motif = window.prompt("Motif de l'avis défavorable (visible par la RH et le collaborateur) :");
      if (motif === null) return; // annulé
      avisHierarchieMotif = motif.trim() || null;
    } else if (avisHierarchie === "changement_demande") {
      const motif = window.prompt("Qu'attendez-vous du collaborateur (dates à changer, pourquoi) ?");
      if (motif === null) return; // annulé
      if (!motif.trim()) {
        alert("Précisez ce qui doit changer.");
        return;
      }
      avisHierarchieMotif = motif.trim();
    }
    const res = await fetch(`/api/conges/requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avisHierarchie, avisHierarchieMotif }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRequests((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    }
  }

  if (requests.length === 0) {
    return (
      <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center">
        <div className="mb-1 text-sm font-semibold text-nb">Aucune demande à traiter</div>
        <p className="mx-auto max-w-md text-xs text-gm">
          Les demandes de congé des collaborateurs dont vous êtes le manager (dans Neos) apparaîtront
          ici.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[14px] border border-v/10 bg-white">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-bg">
            {["Collaborateur", "Motif", "Du", "Au", "Jours", "Justificatif", "Votre avis", "Statut RH"].map(
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
          {requests.map((r) => {
            const avis = AVIS_LABEL[r.avisHierarchie];
            const s = STATUT_LABEL[r.statut];
            return (
              <tr key={r.id} className="border-b border-v/5 last:border-none hover:bg-gl">
                <td className="px-3.5 py-2.5 font-medium text-nb">{r.employeNom}</td>
                <td className="px-3.5 py-2.5 text-nb">
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
                  {r.avisHierarchie === "en_attente" ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setAvis(r, "favorable")}
                        className="rounded-md bg-sc/15 px-2 py-1 text-[11px] font-medium text-[#0E7A50]"
                      >
                        Favorable
                      </button>
                      <button
                        onClick={() => setAvis(r, "defavorable")}
                        className="rounded-md bg-er/15 px-2 py-1 text-[11px] font-medium text-er"
                      >
                        Défavorable
                      </button>
                      <button
                        onClick={() => setAvis(r, "changement_demande")}
                        className="rounded-md bg-wn/15 px-2 py-1 text-[11px] font-medium text-[#8F5500]"
                      >
                        Changer les dates
                      </button>
                    </div>
                  ) : (
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
                  )}
                </td>
                <td className="px-3.5 py-2.5">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: s.bg, color: s.fg }}
                  >
                    {s.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
