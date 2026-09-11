"use client";

import { useMemo, useState } from "react";
import { fmtDate, initials } from "@/lib/format";

export type CandidateStage =
  | "nouveau"
  | "preselection"
  | "entretien"
  | "offre"
  | "embauche"
  | "refuse";

export interface Candidate {
  id: string;
  fullname: string;
  poste: string;
  email: string | null;
  telephone: string | null;
  source: string | null;
  notes: string | null;
  stage: CandidateStage;
  cvPath: string | null;
  createdAt: string;
  updatedAt: string;
}

const STAGES: { key: CandidateStage; label: string }[] = [
  { key: "nouveau", label: "Nouveau" },
  { key: "preselection", label: "Présélection" },
  { key: "entretien", label: "Entretien" },
  { key: "offre", label: "Offre" },
  { key: "embauche", label: "Embauché" },
  { key: "refuse", label: "Refusé" },
];

const STAGE_ORDER = STAGES.map((s) => s.key);

const emptyForm = {
  fullname: "",
  poste: "",
  email: "",
  telephone: "",
  source: "",
  notes: "",
};

export function RecruitmentBoard({
  initialCandidates,
  dbEnabled,
}: {
  initialCandidates: Candidate[];
  dbEnabled: boolean;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map: Record<CandidateStage, Candidate[]> = {
      nouveau: [],
      preselection: [],
      entretien: [],
      offre: [],
      embauche: [],
      refuse: [],
    };
    for (const c of candidates) map[c.stage]?.push(c);
    return map;
  }, [candidates]);

  async function moveStage(c: Candidate, dir: 1 | -1) {
    const idx = STAGE_ORDER.indexOf(c.stage);
    const next = STAGE_ORDER[idx + dir];
    if (!next) return;
    const res = await fetch(`/api/recrutement/candidates/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: next }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCandidates((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    }
  }

  async function removeCandidate(c: Candidate) {
    if (!confirm(`Supprimer ${c.fullname} du pipeline ?`)) return;
    const res = await fetch(`/api/recrutement/candidates/${c.id}`, { method: "DELETE" });
    if (res.ok) setCandidates((prev) => prev.filter((x) => x.id !== c.id));
  }

  async function submitForm(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.fullname.trim() || !form.poste.trim()) return;
    setSaving(true);
    setError(null);
    try {
      let cvPath: string | null = editing?.cvPath ?? null;
      if (file) {
        const body = new FormData();
        body.append("file", file);
        const uploadRes = await fetch("/api/recrutement/upload", { method: "POST", body });
        if (uploadRes.ok) {
          const data = await uploadRes.json();
          cvPath = data.pathname;
        }
      }

      if (editing) {
        const res = await fetch(`/api/recrutement/candidates/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, cvPath }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Échec");
        const updated = await res.json();
        setCandidates((prev) => prev.map((c) => (c.id === editing.id ? updated : c)));
      } else {
        const res = await fetch("/api/recrutement/candidates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, cvPath }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Échec");
        const created = await res.json();
        setCandidates((prev) => [created, ...prev]);
      }
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(c: Candidate) {
    setEditing(c);
    setForm({
      fullname: c.fullname,
      poste: c.poste,
      email: c.email ?? "",
      telephone: c.telephone ?? "",
      source: c.source ?? "",
      notes: c.notes ?? "",
    });
    setFile(null);
    setShowForm(true);
  }

  if (!dbEnabled) {
    return (
      <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center">
        <div className="mb-1 text-sm font-semibold text-nb">Base de données non configurée</div>
        <p className="mx-auto max-w-md text-xs text-gm">
          Le pipeline de recrutement a besoin d&apos;une base Postgres (Neon) pour stocker les
          candidats — Neos ne fournit aucune ressource de ce type. Ajoutez <code>DATABASE_URL</code>{" "}
          dans les variables d&apos;environnement du projet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-gm">{candidates.length} candidat(s) dans le pipeline</span>
        <button
          onClick={() => {
            setEditing(null);
            setForm(emptyForm);
            setFile(null);
            setShowForm(true);
          }}
          className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm"
        >
          + Ajouter un candidat
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => (
          <div key={stage.key} className="w-[260px] shrink-0">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gd">
                {stage.label}
              </span>
              <span className="rounded-full bg-bg2 px-1.5 py-0.5 text-[10px] font-semibold text-gm">
                {byStage[stage.key].length}
              </span>
            </div>
            <div className="flex min-h-[80px] flex-col gap-2 rounded-[12px] bg-bg2/60 p-2">
              {byStage[stage.key].map((c) => (
                <div
                  key={c.id}
                  className="rounded-[10px] border border-v/10 bg-white p-3 shadow-sm"
                >
                  <div className="mb-1.5 flex items-start gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-v text-[10px] font-semibold text-white">
                      {initials(c.fullname)}
                    </div>
                    <button
                      onClick={() => openEdit(c)}
                      className="min-w-0 flex-1 text-left hover:underline"
                    >
                      <div className="truncate text-[13px] font-medium text-nb">{c.fullname}</div>
                      <div className="truncate text-[11px] text-gm">{c.poste}</div>
                    </button>
                  </div>
                  {c.source && (
                    <div className="mb-1.5 text-[10px] text-gm">Source : {c.source}</div>
                  )}
                  {c.cvPath && (
                    <a
                      href={`/api/files/download?path=${encodeURIComponent(c.cvPath)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mb-1.5 block text-[11px] text-v hover:underline"
                    >
                      📎 CV
                    </a>
                  )}
                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="text-[10px] text-gm">{fmtDate(c.createdAt)}</div>
                    <div className="flex gap-1">
                      <button
                        disabled={STAGE_ORDER.indexOf(c.stage) === 0}
                        onClick={() => moveStage(c, -1)}
                        title="Étape précédente"
                        className="h-5 w-5 rounded border border-v/15 text-[10px] disabled:opacity-30"
                      >
                        ‹
                      </button>
                      <button
                        disabled={STAGE_ORDER.indexOf(c.stage) === STAGE_ORDER.length - 1}
                        onClick={() => moveStage(c, 1)}
                        title="Étape suivante"
                        className="h-5 w-5 rounded border border-v/15 text-[10px] disabled:opacity-30"
                      >
                        ›
                      </button>
                      <button
                        onClick={() => removeCandidate(c)}
                        title="Supprimer"
                        className="h-5 w-5 rounded border border-er/20 text-[10px] text-er"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-vd/50 p-4"
          onClick={() => setShowForm(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitForm}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[14px] bg-white p-5"
          >
            <div className="mb-4 text-sm font-semibold text-nb">
              {editing ? "Modifier le candidat" : "Nouveau candidat"}
            </div>
            <div className="flex flex-col gap-3">
              <input
                required
                placeholder="Nom complet"
                value={form.fullname}
                onChange={(e) => setForm((f) => ({ ...f, fullname: e.target.value }))}
                className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              />
              <input
                required
                placeholder="Poste visé"
                value={form.poste}
                onChange={(e) => setForm((f) => ({ ...f, poste: e.target.value }))}
                className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              />
              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              />
              <input
                placeholder="Téléphone"
                value={form.telephone}
                onChange={(e) => setForm((f) => ({ ...f, telephone: e.target.value }))}
                className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              />
              <input
                placeholder="Source (LinkedIn, cooptation, ...)"
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                className="rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              />
              <textarea
                placeholder="Notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="resize-none rounded-lg border border-v/15 bg-bg px-3 py-2 text-sm outline-none focus:border-v"
              />
              <label className="flex flex-col gap-1 text-[11px] font-medium text-gd">
                CV {editing?.cvPath && "(remplacer)"}
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="rounded-lg border border-v/15 bg-bg px-2 py-1.5 text-[11px] file:mr-2 file:rounded-md file:border-none file:bg-v file:px-2 file:py-1 file:text-[11px] file:text-white"
                />
              </label>
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
                {saving ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
