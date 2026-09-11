import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getEmployes, fmtDate } from "@/lib/data";

function csvEscape(v: string): string {
  if (/[",\n;]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const employes = await getEmployes(session);
  const header = [
    "Nom",
    "Prénoms",
    "Entité",
    "Fonction",
    "Type contrat",
    "Salaire net",
    "Salaire brut",
    "Date début",
    "Date fin",
    "Alerte",
  ];
  const lines = [header.join(";")];
  for (const e of employes) {
    lines.push(
      [
        e.nom,
        e.prenoms,
        e.entite,
        e.fonction,
        e.contratType,
        String(e.salNet ?? ""),
        String(e.salBrut ?? ""),
        fmtDate(e.dateDebut),
        fmtDate(e.dateFin),
        e.alerte,
      ]
        .map((v) => csvEscape(String(v)))
        .join(";")
    );
  }

  const csv = "﻿" + lines.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="personnel_synelia.csv"`,
    },
  });
}
