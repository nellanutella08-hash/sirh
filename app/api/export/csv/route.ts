import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { getEmployes, fmtDate } from "@/lib/data";
import { getPersonnelAffectations, CACHE_ENABLED } from "@/lib/db";

function csvEscape(v: string): string {
  if (/[",\n;]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

const CLASSIFICATION_LABEL: Record<string, string> = {
  regie: "Régie",
  hors_regie: "Hors régie",
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const employes = await getEmployes(session);
  const affectations = CACHE_ENABLED
    ? await getPersonnelAffectations(session.tenantId)
    : new Map();
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
    "Catégorie",
    "Régie",
    "Pôle",
    "Classification",
    "Type de projet",
  ];
  const lines = [header.join(";")];
  for (const e of employes) {
    const a = affectations.get(e.id);
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
        a?.categorie ?? "",
        a?.regie ?? "",
        a?.poleTechSupport ?? "",
        a?.classification ? CLASSIFICATION_LABEL[a.classification] : "",
        a?.typeProjet ?? "",
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
