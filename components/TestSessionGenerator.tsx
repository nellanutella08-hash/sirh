"use client";

import { useState } from "react";

interface EmployeOption {
  id: number;
  fullname: string;
  fonction: string;
  estManager: boolean;
}

/** RH-only tool: generates a short-lived "log in as this person" link so
 * RH can test the collaborateur/manager experience themselves, without a
 * second Neos password. Open the link in a private/incognito window to
 * keep the RH session in the current one untouched. */
export function TestSessionGenerator({ employes }: { employes: EmployeOption[] }) {
  const [employeId, setEmployeId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; employeNom: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function generer(ev: React.FormEvent) {
    ev.preventDefault();
    if (!employeId) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    setCopied(false);
    const res = await fetch("/api/auth/test-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeId: Number(employeId) }),
    });
    const data = await res.json();
    setGenerating(false);
    if (!res.ok) {
      setError(data.error ?? "Échec de la génération");
      return;
    }
    setResult(data);
  }

  async function copier() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — the link is still shown to copy by hand
    }
  }

  const managers = employes.filter((e) => e.estManager);
  const autres = employes.filter((e) => !e.estManager);

  return (
    <div className="rounded-[14px] border border-v/10 bg-white p-4">
      <p className="mb-3 text-xs text-gm">
        Choisis un collaborateur ci-dessous et génère un lien de connexion — valable 15 minutes,
        rôle simple collaborateur (les personnes marquées « manager » ont des collaborateurs sous
        elles dans Neos, pratique pour tester le volet manager).
      </p>
      <p className="mb-3 rounded-lg bg-[#FFF8EC] px-3 py-2 text-[11px] text-[#7A4A00]">
        ⚠️ Copie le lien et ouvre-le dans une <strong>nouvelle fenêtre privée/incognito</strong>{" "}
        (Ctrl/Cmd+Maj+N) — pas dans un simple nouvel onglet : les cookies sont partagés entre les
        onglets d&apos;une même fenêtre, donc l&apos;ouvrir ailleurs remplacerait ta session RH
        actuelle dans tout ce navigateur.
      </p>

      <form onSubmit={generer} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-gd">Collaborateur</label>
          <select
            required
            value={employeId}
            onChange={(e) => setEmployeId(e.target.value)}
            className="min-w-[260px] rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs outline-none focus:border-v"
          >
            <option value="">Sélectionner…</option>
            {managers.length > 0 && (
              <optgroup label="Managers (ont une équipe)">
                {managers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullname} — {e.fonction}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Autres collaborateurs">
              {autres.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullname} — {e.fonction}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <button
          type="submit"
          disabled={generating}
          className="rounded-lg bg-v px-3.5 py-1.5 text-xs font-medium text-white hover:bg-vm disabled:opacity-60"
        >
          {generating ? "Génération…" : "Générer le lien de test"}
        </button>
      </form>

      {error && <div className="mt-2 text-xs text-er">{error}</div>}

      {result && (
        <div className="mt-3 rounded-lg bg-bg p-3">
          <div className="mb-1.5 text-[11px] font-semibold text-gd">
            Lien de connexion — {result.employeNom} (expire dans 15 min)
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={result.url}
              onFocus={(e) => e.target.select()}
              className="min-w-0 flex-1 rounded-md border border-v/15 bg-white px-2 py-1.5 text-[11px] text-nb outline-none"
            />
            <button
              type="button"
              onClick={copier}
              className="shrink-0 rounded-md bg-v px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-vm"
            >
              {copied ? "Copié !" : "Copier le lien"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
