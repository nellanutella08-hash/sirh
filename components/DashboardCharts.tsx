"use client";

import { useMemo, useState } from "react";
import { ChartCard, DoughnutChart, BarChart } from "@/components/Charts";

interface DashEmploye {
  id: number;
  entite: string;
  contratType: string;
  alerte: string;
  salNet: number | null;
}

interface Affectation {
  regie: string | null;
  poleTechSupport: string | null;
  classification: "regie" | "hors_regie" | null;
  typeProjet: string | null;
}

const ALERTE_LABELS: Record<string, string> = {
  ok: "OK",
  attention: "Attention (30-90j)",
  urgent: "Urgent (15-30j)",
  a_renouveler: "À renouveler (<14j)",
  expiré: "Expiré",
  cdi: "CDI / Indéterminé",
};

function countBy<T>(rows: T[], get: (r: T) => string): [string, number][] {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = get(r) || "—";
    out[v] = (out[v] ?? 0) + 1;
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

function sumBy<T>(rows: T[], get: (r: T) => string, val: (r: T) => number): [string, number][] {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = get(r) || "—";
    out[v] = (out[v] ?? 0) + val(r);
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

/** The dashboard's charts, made interactive: RH picks entité/pôle/régie/
 * classification/type de projet and every chart re-slices to just that
 * subset — reading a breakdown no longer means opening Personnel and
 * filtering there by hand. Affectation data (pôle, régie, classification,
 * type de projet) comes from RH's own consolidated-file import/edits, not
 * Neos — see lib/personnelImport.ts. */
export function DashboardCharts({
  employes,
  affectations,
}: {
  employes: DashEmploye[];
  affectations: Record<number, Affectation>;
}) {
  const [entite, setEntite] = useState("");
  const [pole, setPole] = useState("");
  const [regie, setRegie] = useState("");
  const [classification, setClassification] = useState("");
  const [typeProjet, setTypeProjet] = useState("");

  const entites = useMemo(() => Array.from(new Set(employes.map((e) => e.entite))).sort(), [employes]);
  const poles = useMemo(
    () =>
      Array.from(new Set(Object.values(affectations).map((a) => a.poleTechSupport).filter((v): v is string => Boolean(v)))).sort(),
    [affectations]
  );
  const regies = useMemo(
    () =>
      Array.from(new Set(Object.values(affectations).map((a) => a.regie).filter((v): v is string => Boolean(v)))).sort(),
    [affectations]
  );
  const typesProjet = useMemo(
    () =>
      Array.from(new Set(Object.values(affectations).map((a) => a.typeProjet).filter((v): v is string => Boolean(v)))).sort(),
    [affectations]
  );

  const filtered = useMemo(() => {
    return employes.filter((e) => {
      if (entite && e.entite !== entite) return false;
      const a = affectations[e.id];
      if (pole && a?.poleTechSupport !== pole) return false;
      if (regie && a?.regie !== regie) return false;
      if (classification && a?.classification !== classification) return false;
      if (typeProjet && a?.typeProjet !== typeProjet) return false;
      return true;
    });
  }, [employes, affectations, entite, pole, regie, classification, typeProjet]);

  const parEntite = useMemo(() => countBy(filtered, (e) => e.entite), [filtered]);
  const parContrat = useMemo(() => countBy(filtered, (e) => e.contratType), [filtered]);
  const parAlerte = useMemo(() => countBy(filtered, (e) => e.alerte), [filtered]);
  const masseParEntite = useMemo(
    () => sumBy(filtered, (e) => e.entite, (e) => e.salNet ?? 0).slice(0, 8),
    [filtered]
  );
  const parPole = useMemo(
    () => countBy(filtered, (e) => affectations[e.id]?.poleTechSupport ?? "Non renseigné"),
    [filtered, affectations]
  );
  const parRegie = useMemo(
    () => countBy(filtered, (e) => affectations[e.id]?.regie ?? "Hors régie / non renseigné").slice(0, 12),
    [filtered, affectations]
  );

  const anyFilter = entite || pole || regie || classification || typeProjet;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-v/10 bg-white px-4 py-3">
        <span className="text-[13px] font-semibold text-nb">
          {filtered.length} collaborateur{filtered.length > 1 ? "s" : ""}
          {anyFilter && <span className="font-normal text-gm"> (sur {employes.length})</span>}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <select
            value={entite}
            onChange={(e) => setEntite(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">Toutes les entités</option>
            {entites.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={pole}
            onChange={(e) => setPole(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">Tous les pôles</option>
            {poles.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={regie}
            onChange={(e) => setRegie(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">Toutes les régies</option>
            {regies.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">Régie / Hors régie</option>
            <option value="regie">Régie</option>
            <option value="hors_regie">Hors régie</option>
          </select>
          <select
            value={typeProjet}
            onChange={(e) => setTypeProjet(e.target.value)}
            className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs text-nb outline-none focus:border-v"
          >
            <option value="">Tous les types de projet</option>
            {typesProjet.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {anyFilter && (
            <button
              onClick={() => {
                setEntite("");
                setPole("");
                setRegie("");
                setClassification("");
                setTypeProjet("");
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs text-gm hover:text-v hover:underline"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard title="Effectifs par entité">
          <BarChart labels={parEntite.slice(0, 10).map(([k]) => k)} data={parEntite.slice(0, 10).map(([, v]) => v)} />
        </ChartCard>
        <ChartCard title="Effectif par pôle">
          <DoughnutChart labels={parPole.map(([k]) => k)} data={parPole.map(([, v]) => v)} />
        </ChartCard>
        <ChartCard title="Effectif par régie (top 12)">
          <BarChart labels={parRegie.map(([k]) => k)} data={parRegie.map(([, v]) => v)} color="#7A5AF8" />
        </ChartCard>
        <ChartCard title="Répartition types de contrat">
          <DoughnutChart labels={parContrat.map(([k]) => k)} data={parContrat.map(([, v]) => v)} />
        </ChartCard>
        <ChartCard title="Alertes contrats">
          <DoughnutChart
            labels={parAlerte.map(([k]) => ALERTE_LABELS[k] ?? k)}
            data={parAlerte.map(([, v]) => v)}
          />
        </ChartCard>
        <ChartCard title="Masse salariale nette par entité (top 8)">
          <BarChart
            labels={masseParEntite.map(([k]) => k)}
            data={masseParEntite.map(([, v]) => Math.round(v / 1_000_000))}
            color="#C0297A"
          />
        </ChartCard>
      </div>
    </>
  );
}
