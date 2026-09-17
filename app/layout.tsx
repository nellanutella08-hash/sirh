import type { Metadata } from "next";
import "./globals.css";

// Cambria/Calibri (charte graphique Synelia v6.3) sont livrées avec
// Microsoft Office sur Windows et Mac mais ne sont pas des polices web
// (Google Fonts ne les distribue pas) — la charte prescrit donc, pour le
// web, exactement la pile de repli définie dans globals.css plutôt qu'un
// chargement next/font, ce qui reste conforme à sa section 4.5.
export const metadata: Metadata = {
  title: "Synelia RH — SIRH",
  description: "Système d'Information RH — Groupe Synelia",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-bg text-nb antialiased">{children}</body>
    </html>
  );
}
