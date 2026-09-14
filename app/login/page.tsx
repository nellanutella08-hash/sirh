"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Connexion impossible");
        return;
      }
      // "/" resolves the right destination server-side based on role
      // (RH -> /dashboard, collaborateur -> /mes-documents).
      router.push("/");
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-vd px-4">
      <div className="w-full max-w-[380px] rounded-[20px] bg-white p-10 shadow-[0_8px_32px_rgba(75,40,130,0.14)]">
        <div className="mb-7 text-center">
          <div className="text-2xl font-bold tracking-tight text-v">Synelia RH</div>
          <div className="mt-1 text-xs text-gm">Système d&apos;Information RH</div>
        </div>
        <div className="mb-5 text-[15px] font-semibold text-nb">Connexion</div>
        <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gd">Identifiant Neos</label>
            <input
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="nom d'utilisateur ou email"
              className="rounded-lg border border-v/20 bg-bg px-3 py-2 text-sm text-nb outline-none transition-colors focus:border-v focus:bg-white"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gd">Mot de passe</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded-lg border border-v/20 bg-bg px-3 py-2 text-sm text-nb outline-none transition-colors focus:border-v focus:bg-white"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-er/10 px-3 py-2 text-xs font-medium text-er">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-lg bg-v py-2.5 text-sm font-medium text-white transition-colors hover:bg-vm disabled:opacity-60"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
        <p className="mt-5 text-center text-[11px] text-gm">
          Connexion via le compte Neos (ERP Synelia)
        </p>
      </div>
    </div>
  );
}
