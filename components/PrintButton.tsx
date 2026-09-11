"use client";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-v px-4 py-2 text-sm font-medium text-white hover:bg-vm print:hidden"
    >
      Imprimer / Enregistrer en PDF
    </button>
  );
}
