"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/format";

export interface PipelineRow {
  poste: string;
  departement: string;
  demandeur: string;
  mode: string;
  candidat: string;
  contratSigne: boolean;
  dateDebutContrat: string | null;
  etatPilotage: string;
  motif: string;
  statut: string;
  etapeActuelle: string;
}

export interface DepartRow {
  fullname: string;
  email: string;
  dateDepart: string | null;
  lieuTravail: string;
  typeContrat: string;
  fonction: string;
}

const STATUT_COLOR: Record<string, { bg: string; fg: string }> = {
  "Contrat signé": { bg: "#E6FAF4", fg: "#0A5C3A" },
  Bloqué: { bg: "#FDECEA", fg: "#8B1A1A" },
  Suspendu: { bg: "#FFF8EC", fg: "#7A4A00" },
  "Offre acceptée": { bg: "#EEF0F8", fg: "#3A2A6A" },
};

function RefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      onClick={() => {
        setLoading(true);
        router.refresh();
        setTimeout(() => setLoading(false), 600);
      }}
      className="rounded-lg border border-v/20 px-3 py-1.5 text-xs font-medium text-nb hover:bg-gl"
    >
      {loading ? "Actualisation…" : "↻ Actualiser depuis Google Sheets"}
    </button>
  );
}

export function RecrutementPipeline({
  pipeline,
  departs,
  errorPipeline,
  errorDeparts,
}: {
  pipeline: PipelineRow[];
  departs: DepartRow[];
  errorPipeline: string | null;
  errorDeparts: string | null;
}) {
  const [tab, setTab] = useState<"pipeline" | "departs">("pipeline");
  const [statutFiltre, setStatutFiltre] = useState("");

  const statuts = useMemo(() => Array.from(new Set(pipeline.map((p) => p.statut).filter(Boolean))).sort(), [pipeline]);
  const filtered = statutFiltre ? pipeline.filter((p) => p.statut === statutFiltre) : pipeline;

  const departsTries = useMemo(
    () => [...departs].sort((a, b) => (b.dateDepart ?? "").localeCompare(a.dateDepart ?? "")),
    [departs]
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-0.5 rounded-[10px] bg-bg2 p-1">
          <button
            onClick={() => setTab("pipeline")}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              tab === "pipeline" ? "bg-white text-v shadow-sm" : "text-gm hover:text-nb"
            }`}
          >
            Pipeline ({pipeline.length})
          </button>
          <button
            onClick={() => setTab("departs")}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              tab === "departs" ? "bg-white text-v shadow-sm" : "text-gm hover:text-nb"
            }`}
          >
            Départs ({departs.length})
          </button>
        </div>
        <div className="flex items-center gap-2">
          {tab === "pipeline" && statuts.length > 0 && (
            <select
              value={statutFiltre}
              onChange={(e) => setStatutFiltre(e.target.value)}
              className="rounded-lg border border-v/15 bg-white px-3 py-1.5 text-xs outline-none focus:border-v"
            >
              <option value="">Tous statuts</option>
              {statuts.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <RefreshButton />
        </div>
      </div>

      <p className="mb-3 text-[11px] text-gm">
        Source : fichier Google Sheets partagé — cette vue remplace la saisie manuelle et se
        recharge à chaque visite (bouton « Actualiser » pour forcer une relecture immédiate).
      </p>

      {tab === "pipeline" && (
        <>
          {errorPipeline ? (
            <ErrorCard message={errorPipeline} />
          ) : filtered.length === 0 ? (
            <EmptyCard label="Aucun candidat dans le pipeline." />
          ) : (
            <div className="overflow-x-auto rounded-[14px] border border-v/10 bg-white">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-bg">
                    {["Candidat", "Poste", "Département", "Demandeur", "Mode", "Contrat signé", "Début contrat", "Statut", "Motif"].map(
                      (h) => (
                        <th key={h} className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => {
                    const color = STATUT_COLOR[p.statut];
                    return (
                      <tr key={i} className="border-b border-v/5 last:border-none hover:bg-gl">
                        <td className="px-3.5 py-2.5 font-medium text-nb">{p.candidat}</td>
                        <td className="px-3.5 py-2.5 text-nb">{p.poste}</td>
                        <td className="px-3.5 py-2.5 text-nb">{p.departement}</td>
                        <td className="px-3.5 py-2.5 text-nb">{p.demandeur}</td>
                        <td className="px-3.5 py-2.5 text-nb">{p.mode}</td>
                        <td className="px-3.5 py-2.5">{p.contratSigne ? "✅ Oui" : "—"}</td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-nb">
                          {p.dateDebutContrat ? fmtDate(p.dateDebutContrat) : "—"}
                        </td>
                        <td className="px-3.5 py-2.5">
                          {p.statut ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={color ? { background: color.bg, color: color.fg } : { background: "#F5F5F5", color: "#666" }}
                            >
                              {p.statut}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-gm">{p.motif || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "departs" && (
        <>
          {errorDeparts ? (
            <ErrorCard message={errorDeparts} />
          ) : departsTries.length === 0 ? (
            <EmptyCard label="Aucun départ enregistré." />
          ) : (
            <div className="overflow-x-auto rounded-[14px] border border-v/10 bg-white">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-bg">
                    {["Nom", "Fonction", "Lieu de travail", "Type de contrat", "Date de départ", "Email"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {departsTries.map((d, i) => (
                    <tr key={i} className="border-b border-v/5 last:border-none hover:bg-gl">
                      <td className="px-3.5 py-2.5 font-medium text-nb">{d.fullname}</td>
                      <td className="px-3.5 py-2.5 text-nb">{d.fonction}</td>
                      <td className="px-3.5 py-2.5 text-nb">{d.lieuTravail}</td>
                      <td className="px-3.5 py-2.5 text-nb">{d.typeContrat}</td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-nb">
                        {d.dateDepart ? fmtDate(d.dateDepart) : "—"}
                      </td>
                      <td className="px-3.5 py-2.5 text-gm">{d.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-[14px] border border-er/20 bg-[#FDECEA] p-6 text-center text-xs text-[#8B1A1A]">
      {message}
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-xs text-gm">{label}</div>
  );
}
