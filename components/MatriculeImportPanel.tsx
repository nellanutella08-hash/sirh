"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ImportReport {
  totalRows: number;
  imported: number;
  ambiguous: { row: number; nom: string; prenoms: string; candidats: string[] }[];
  unmatched: { row: number; nom: string; prenoms: string }[];
}

/** Import of the "Liste employés" export from Neos's own UI — the only
 * source for the real personnel matricule (Neos's API doesn't expose it).
 * Matched by email, falling back to name; anything ambiguous or unmatched
 * comes back here for RH to sort out by hand. */
export function MatriculeImportPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      const res = await fetch("/api/personnel/import-matricules", { method: "POST", body });
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
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-v/20 px-3 py-1.5 text-xs font-medium text-nb hover:bg-gl"
      >
        Importer les matricules
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-vd/50 p-4"
          onClick={() => !uploading && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[14px] bg-white p-5"
          >
            <div className="mb-1 text-sm font-semibold text-nb">Importer les matricules</div>
            <p className="mb-3 text-xs text-gm">
              Export &quot;Liste employés&quot; de Neos (colonnes Matricule/Nom/Prénoms/Email) — Neos
              n&apos;expose pas ce champ via son API, il doit être réimporté depuis cet export à chaque
              mise à jour. Chaque collaborateur reconnu (par email, puis par nom) voit son matricule mis à
              jour ; le reste de vos données Neos n&apos;est pas touché.
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
              <div className="flex flex-col gap-3 text-xs">
                <div className="rounded-lg bg-sc/15 px-3 py-2 font-medium text-[#0E7A50]">
                  {report.imported} / {report.totalRows} matricules mis à jour.
                </div>

                {report.ambiguous.length > 0 && (
                  <div>
                    <div className="mb-1 font-semibold text-nb">
                      {report.ambiguous.length} cas ambigus (plusieurs correspondances possibles) —
                      à corriger vous-même sur la fiche du bon collaborateur :
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {report.ambiguous.map((a) => (
                        <li key={a.row} className="rounded-lg bg-bg px-2.5 py-1.5">
                          <div className="font-medium text-nb">
                            Ligne {a.row} — {a.nom} {a.prenoms}
                          </div>
                          <div className="mt-0.5 text-gm">Candidats : {a.candidats.join(" · ")}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {report.unmatched.length > 0 && (
                  <div>
                    <div className="mb-1 font-semibold text-nb">
                      {report.unmatched.length} lignes sans correspondance dans Neos :
                    </div>
                    <ul className="flex flex-col gap-1 text-gm">
                      {report.unmatched.map((u) => (
                        <li key={u.row}>
                          Ligne {u.row} — {u.nom} {u.prenoms}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setOpen(false)}
              disabled={uploading}
              className="mt-4 rounded-lg border border-v/15 px-3 py-1.5 text-xs text-gm"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
