"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ImportReport {
  familles: number;
  emploiTypes: number;
  competenceSocles: number;
  competences: number;
  personnesImportees: number;
  personnesNonRattacheesEmploiType: { matricule: string; nom: string; prenoms: string }[];
  personnesNonMatcheesNeos: { matricule: string; nom: string; prenoms: string; entite: string }[];
}

interface Personne {
  id: string;
  nom: string;
  prenoms: string;
  matricule: string;
  entite: string;
  emploiTypeId: string | null;
  managerId: string | null;
  actif: boolean;
}

interface Campagne {
  id: string;
  nom: string;
  dateDebut: string;
  dateFin: string;
  statut: "ouverte" | "cloturee";
  stats: { total: number; autoRempli: number; managerRempli: number; retenuRempli: number; alertes: number };
}

function ImportPanel() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    setReport(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/gpec/import", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Échec de l'import");
      setReport(data);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-v/10 bg-white p-4">
      <div className="mb-1 text-sm font-semibold text-nb">Import des référentiels</div>
      <p className="mb-3 text-xs text-gm">
        GPEC_Synelia_Referentiels.xlsx (Référentiel_Emplois, Échelle_Niveaux, Savoir-être_Comportemental,
        Référentiel_Compétences, Cartographie_Personnes) — sans risque à ré-importer, chaque ligne est mise
        à jour plutôt que dupliquée.
      </p>
      <label className="mb-3 flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-v/25 bg-bg px-4 py-6 text-center text-xs text-gm hover:border-v">
        {uploading ? "Import en cours…" : "Cliquez pour choisir le fichier .xlsx"}
        <input
          type="file"
          accept=".xlsx"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
      </label>

      {error && <div className="mb-3 text-xs text-er">{error}</div>}

      {report && (
        <div className="flex flex-col gap-2 text-xs">
          <div className="rounded-lg bg-sc/15 px-3 py-2 font-medium text-[#0E7A50]">
            {report.familles} familles · {report.emploiTypes} emplois-types · {report.competenceSocles} compétences
            socles · {report.competences} compétences · {report.personnesImportees} personnes.
          </div>
          {report.personnesNonRattacheesEmploiType.length > 0 && (
            <div className="rounded-lg bg-wn/15 px-3 py-2 text-nb">
              {report.personnesNonRattacheesEmploiType.length} personne(s) sans emploi-type reconnu — à rattacher
              manuellement ci-dessous.
            </div>
          )}
          {report.personnesNonMatcheesNeos.length > 0 && (
            <div className="rounded-lg bg-wn/15 px-3 py-2 text-nb">
              {report.personnesNonMatcheesNeos.length} personne(s) non retrouvées dans Neos (par nom) — leur fiche
              GPEC existe mais elles ne pourront pas encore se connecter à leur espace.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CampagnesPanel({ campagnes }: { campagnes: Campagne[] }) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  async function create() {
    if (!nom || !dateDebut || !dateFin) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/gpec/campagnes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, dateDebut, dateFin }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Échec de la création");
      setNom("");
      setDateDebut("");
      setDateFin("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatut(c: Campagne) {
    setToggling(c.id);
    try {
      const res = await fetch(`/api/gpec/campagnes/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: c.statut === "ouverte" ? "cloturee" : "ouverte" }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Échec");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="rounded-[14px] border border-v/10 bg-white p-4">
      <div className="mb-3 text-sm font-semibold text-nb">Campagnes d&apos;évaluation</div>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-bg p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gm">Nom</label>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Campagne GPEC S2 2026"
            className="rounded-md border border-v/15 px-2 py-1 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gm">Début</label>
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="rounded-md border border-v/15 px-2 py-1 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-gm">Fin</label>
          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="rounded-md border border-v/15 px-2 py-1 text-xs"
          />
        </div>
        <button
          onClick={create}
          disabled={creating || !nom || !dateDebut || !dateFin}
          className="rounded-md bg-v px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {creating ? "Création…" : "Ouvrir une campagne"}
        </button>
      </div>

      {error && <div className="mb-2 text-xs text-er">{error}</div>}

      {campagnes.length === 0 ? (
        <div className="text-xs text-gm">Aucune campagne pour le moment.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {campagnes.map((c) => {
            const pctAuto = c.stats.total > 0 ? Math.round((c.stats.autoRempli / c.stats.total) * 100) : 0;
            const pctManager = c.stats.total > 0 ? Math.round((c.stats.managerRempli / c.stats.total) * 100) : 0;
            return (
              <div key={c.id} className="rounded-lg bg-bg p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-medium text-nb">{c.nom}</span>
                    <span className="ml-2 text-[11px] text-gm">
                      {c.dateDebut} → {c.dateFin}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleStatut(c)}
                    disabled={toggling === c.id}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                      c.statut === "ouverte" ? "bg-sc/15 text-[#0E7A50]" : "bg-v/10 text-v"
                    }`}
                  >
                    {c.statut === "ouverte" ? "Ouverte — clôturer" : "Clôturée — rouvrir"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-3 text-[11px] text-gm">
                  <span>Auto-évaluations : {pctAuto}% ({c.stats.autoRempli}/{c.stats.total})</span>
                  <span>Évaluations manager : {pctManager}% ({c.stats.managerRempli}/{c.stats.total})</span>
                  <span>Niveau retenu : {c.stats.retenuRempli}/{c.stats.total}</span>
                  {c.stats.alertes > 0 && <span className="font-medium text-er">{c.stats.alertes} alerte(s) (|écart| &gt; 1)</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PersonnesPanel({
  personnes,
  emploiTypes,
}: {
  personnes: Personne[];
  emploiTypes: { id: string; nom: string }[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const personneById = new Map(personnes.map((p) => [p.id, p]));

  const filtered = personnes.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${p.nom} ${p.prenoms} ${p.matricule} ${p.entite}`.toLowerCase().includes(q);
  });

  async function patch(personneId: string, body: Record<string, unknown>) {
    setSaving(personneId);
    try {
      const res = await fetch(`/api/gpec/personnes/${personneId}/manager`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) router.refresh();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rounded-[14px] border border-v/10 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-nb">
          Personnes ({personnes.length}) — rattachement emploi-type et manager
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          className="rounded-md border border-v/15 px-2 py-1 text-xs"
        />
      </div>
      <div className="max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-gm">
              <th className="pb-1.5">Personne</th>
              <th className="pb-1.5">Emploi-type</th>
              <th className="pb-1.5">Manager</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-v/5">
                <td className="py-1.5 pr-2">
                  <div className="font-medium text-nb">
                    {p.prenoms} {p.nom}
                  </div>
                  <div className="text-[11px] text-gm">
                    {p.matricule} · {p.entite}
                  </div>
                </td>
                <td className="py-1.5 pr-2">
                  <select
                    defaultValue={p.emploiTypeId ?? ""}
                    disabled={saving === p.id}
                    onChange={(e) => patch(p.id, { emploiTypeId: e.target.value || null })}
                    className="rounded-md border border-v/15 px-1.5 py-1 text-xs"
                  >
                    <option value="">— aucun —</option>
                    {emploiTypes.map((et) => (
                      <option key={et.id} value={et.id}>
                        {et.nom}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5">
                  <select
                    defaultValue={p.managerId ?? ""}
                    disabled={saving === p.id}
                    onChange={(e) => patch(p.id, { managerId: e.target.value || null })}
                    className="rounded-md border border-v/15 px-1.5 py-1 text-xs"
                  >
                    <option value="">— manager non affecté —</option>
                    {personnes
                      .filter((m) => m.id !== p.id)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.prenoms} {m.nom}
                        </option>
                      ))}
                  </select>
                  {p.managerId && !personneById.has(p.managerId) && (
                    <span className="ml-1 text-[10px] text-er">manager introuvable</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Module 1 (référentiels/import) + Module 2 (campagnes) — accès RH-Admin. */
export function GpecAdmin({
  familleCount,
  emploiTypes,
  personnes,
  campagnes,
}: {
  familleCount: number;
  emploiTypes: { id: string; nom: string }[];
  personnes: Personne[];
  campagnes: Campagne[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[14px] border border-v/10 bg-white p-4 text-xs text-gm">
        {familleCount} familles · {emploiTypes.length} emplois-types · {personnes.length} personnes importées.
      </div>
      <ImportPanel />
      <CampagnesPanel campagnes={campagnes} />
      <PersonnesPanel personnes={personnes} emploiTypes={emploiTypes} />
    </div>
  );
}
