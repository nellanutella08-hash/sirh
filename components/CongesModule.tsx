"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtDate } from "@/lib/format";
import { Avatar } from "@/components/Avatar";

export interface CongeEmploye {
  id: number;
  fullname: string;
  entite: string;
  contratType: string;
  dateEntree: string | null;
  photoUrl: string | null;
}

interface Demande {
  id: string;
  employeId: number;
  type: string;
  dateDebut: string;
  dateFin: string;
  jours: number;
  statut: "en_attente" | "validé" | "refusé";
  justificatif?: { pathname: string; originalName: string } | null;
}

const STORAGE_SOLDES = "sirh_conges_soldes_initiaux";
const STORAGE_DEMANDES = "sirh_conges_demandes";
const TYPES = ["Congé payé", "Congé maladie", "Congé exceptionnel", "Congé sans solde"];

function eligibilite(contratType: string): { label: string; tag: string; eligible: boolean } {
  const t = contratType.toUpperCase();
  if (t.includes("CDI")) return { label: "Cumulatif", tag: "bg-[#E8F4FD] text-[#0C447C]", eligible: true };
  if (t.includes("CDD")) return { label: "Remise à zéro", tag: "bg-[#FFF5E0] text-[#7A5000]", eligible: true };
  if (t.includes("STAGE")) return { label: "Stage", tag: "bg-[#F1EEF8] text-[#3A2A6A]", eligible: true };
  return { label: "Non éligible", tag: "bg-[#F5F5F5] text-[#888]", eligible: false };
}

function monthsSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  const start = new Date(dateStr);
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const ref = start > yearStart ? start : yearStart;
  let months = (now.getFullYear() - ref.getFullYear()) * 12 + (now.getMonth() - ref.getMonth());
  if (now.getDate() < ref.getDate()) months--;
  return Math.max(0, Math.min(12, months));
}

function useLocalStorageState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // See the equivalent comment in Sidebar.tsx: localStorage is
    // client-only, so hydrating from it necessarily happens post-mount.
    try {
      const raw = window.localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setValue(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value, loaded]);
  return [value, setValue] as const;
}

export function CongesModule({ employes }: { employes: CongeEmploye[] }) {
  const [tab, setTab] = useState<"soldes" | "demandes" | "saisie">("soldes");
  const [soldesInitiaux, setSoldesInitiaux] = useLocalStorageState<Record<number, number>>(
    STORAGE_SOLDES,
    {}
  );
  const [demandes, setDemandes] = useLocalStorageState<Demande[]>(STORAGE_DEMANDES, []);
  const [form, setForm] = useState({ employeId: "", type: TYPES[0], dateDebut: "", dateFin: "" });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const eligibles = useMemo(() => employes.filter((e) => eligibilite(e.contratType).eligible), [employes]);

  function joursPris(employeId: number): number {
    return demandes
      .filter((d) => d.employeId === employeId && d.statut === "validé")
      .reduce((s, d) => s + d.jours, 0);
  }

  function acquis(e: CongeEmploye): number {
    return Math.round(monthsSince(e.dateEntree) * 2.2 * 10) / 10;
  }

  function soldeDispo(e: CongeEmploye): number {
    return (soldesInitiaux[e.id] ?? 0) + acquis(e) - joursPris(e.id);
  }

  async function submitDemande(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.employeId || !form.dateDebut || !form.dateFin) return;
    const jours =
      Math.round(
        (new Date(form.dateFin).getTime() - new Date(form.dateDebut).getTime()) / 86_400_000
      ) + 1;
    if (jours <= 0) return;

    let justificatif: Demande["justificatif"] = null;
    if (file) {
      setUploading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("employeId", form.employeId);
        const res = await fetch("/api/conges/upload", { method: "POST", body });
        if (res.ok) {
          const data = await res.json();
          justificatif = { pathname: data.pathname, originalName: data.originalName };
        }
      } finally {
        setUploading(false);
      }
    }

    setDemandes((prev) => [
      {
        id: crypto.randomUUID(),
        employeId: Number(form.employeId),
        type: form.type,
        dateDebut: form.dateDebut,
        dateFin: form.dateFin,
        jours,
        statut: "en_attente",
        justificatif,
      },
      ...prev,
    ]);
    setForm({ employeId: "", type: TYPES[0], dateDebut: "", dateFin: "" });
    setFile(null);
  }

  function setStatut(id: string, statut: Demande["statut"]) {
    setDemandes((prev) => prev.map((d) => (d.id === id ? { ...d, statut } : d)));
  }

  const kpis = {
    demandesEnAttente: demandes.filter((d) => d.statut === "en_attente").length,
    validees: demandes.filter((d) => d.statut === "validé").length,
    refusees: demandes.filter((d) => d.statut === "refusé").length,
    eligibles: eligibles.length,
    soldeMoyen: eligibles.length
      ? Math.round((eligibles.reduce((s, e) => s + soldeDispo(e), 0) / eligibles.length) * 10) / 10
      : 0,
  };

  return (
    <>
      <div className="mb-3 rounded-lg border border-v/10 bg-gl px-4 py-2.5 text-xs text-gd">
        Module de démonstration : les soldes et demandes sont stockés localement dans votre navigateur
        (Neos ne fournit pas de ressource « congés »). Les collaborateurs proviennent de Neos en direct.
        Les justificatifs joints sont, eux, stockés côté serveur (Vercel Blob).
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
          { key: "saisie", label: "Saisie soldes CDI/CDD" },
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
            const solde = soldeDispo(e);
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
                <Row label="Acquis (année)" value={`${acquis(e)} j`} />
                <Row label="Pris" value={`${joursPris(e.id)} j`} />
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

      {tab === "demandes" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
          <form
            onSubmit={submitDemande}
            className="flex h-fit flex-col gap-3 rounded-[14px] border border-v/10 bg-white p-4"
          >
            <div className="text-[13px] font-semibold">Nouvelle demande</div>
            <select
              required
              value={form.employeId}
              onChange={(ev) => setForm((f) => ({ ...f, employeId: ev.target.value }))}
              className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v"
            >
              <option value="">Collaborateur…</option>
              {eligibles.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullname}
                </option>
              ))}
            </select>
            <select
              value={form.type}
              onChange={(ev) => setForm((f) => ({ ...f, type: ev.target.value }))}
              className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              type="date"
              required
              value={form.dateDebut}
              onChange={(ev) => setForm((f) => ({ ...f, dateDebut: ev.target.value }))}
              className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v"
            />
            <input
              type="date"
              required
              value={form.dateFin}
              onChange={(ev) => setForm((f) => ({ ...f, dateFin: ev.target.value }))}
              className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-xs outline-none focus:border-v"
            />
            <label className="flex flex-col gap-1 text-[11px] font-medium text-gd">
              Justificatif (optionnel)
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
                className="rounded-lg border border-v/15 bg-bg px-2 py-1.5 text-[11px] file:mr-2 file:rounded-md file:border-none file:bg-v file:px-2 file:py-1 file:text-[11px] file:text-white"
              />
            </label>
            <button
              type="submit"
              disabled={uploading}
              className="rounded-lg bg-v py-2 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
            >
              {uploading ? "Envoi du justificatif…" : "+ Soumettre la demande"}
            </button>
          </form>

          <div className="overflow-x-auto rounded-[14px] border border-v/10 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-bg">
                  {["Collaborateur", "Type", "Du", "Au", "Jours", "Justificatif", "Statut", "Action"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gd">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {demandes.map((d) => {
                  const emp = employes.find((e) => e.id === d.employeId);
                  return (
                    <tr key={d.id} className="border-b border-v/5 last:border-none hover:bg-gl">
                      <td className="px-3 py-2 font-medium">{emp?.fullname ?? "—"}</td>
                      <td className="px-3 py-2">{d.type}</td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtDate(d.dateDebut)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{fmtDate(d.dateFin)}</td>
                      <td className="px-3 py-2">{d.jours}</td>
                      <td className="px-3 py-2">
                        {d.justificatif ? (
                          <a
                            href={`/api/conges/download?path=${encodeURIComponent(d.justificatif.pathname)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-v hover:underline"
                          >
                            📎 {d.justificatif.originalName}
                          </a>
                        ) : (
                          <span className="text-gm">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 capitalize">{d.statut.replace("_", " ")}</td>
                      <td className="px-3 py-2">
                        {d.statut === "en_attente" ? (
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setStatut(d.id, "validé")}
                              className="rounded-md bg-sc/15 px-2 py-1 text-[11px] font-medium text-[#0A5C3A]"
                            >
                              Valider
                            </button>
                            <button
                              onClick={() => setStatut(d.id, "refusé")}
                              className="rounded-md bg-er/15 px-2 py-1 text-[11px] font-medium text-er"
                            >
                              Refuser
                            </button>
                          </div>
                        ) : (
                          <span className="text-gm">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {demandes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gm">
                      Aucune demande pour le moment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              {eligibles.map((e) => (
                <tr key={e.id} className="border-b border-v/5 last:border-none hover:bg-gl">
                  <td className="px-3 py-2 font-medium">{e.fullname}</td>
                  <td className="px-3 py-2">{e.entite}</td>
                  <td className="px-3 py-2">{e.contratType}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.5"
                      value={soldesInitiaux[e.id] ?? 0}
                      onChange={(ev) =>
                        setSoldesInitiaux((prev) => ({ ...prev, [e.id]: Number(ev.target.value) }))
                      }
                      className="w-20 rounded-md border-none bg-bg px-2 py-1 text-center font-mono font-semibold text-v outline-none focus:bg-gl focus:ring-2 focus:ring-v"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
