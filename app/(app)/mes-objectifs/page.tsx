import { redirect } from "next/navigation";

// "Mes objectifs" a fusionné avec la vue RH "Évaluations" dans un seul
// espace (onglets Objectifs / Campagnes, sous-vues par rôle) — cette route
// ne sert plus qu'à rattraper les liens et favoris existants.
export default function MesObjectifsPage() {
  redirect("/evaluations");
}
