"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  async function backToLogin() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg px-4 text-center">
      <div className="text-lg font-semibold text-nb">Une erreur est survenue</div>
      <p className="max-w-md text-sm text-gm">
        Impossible de charger les données (session Neos expirée, ou service momentanément
        indisponible).
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => reset()}
          className="rounded-lg border border-v/20 px-4 py-2 text-sm font-medium text-nb hover:bg-gl"
        >
          Réessayer
        </button>
        <button
          onClick={backToLogin}
          className="rounded-lg bg-v px-4 py-2 text-sm font-medium text-white hover:bg-vm"
        >
          Retour à la connexion
        </button>
      </div>
    </div>
  );
}
