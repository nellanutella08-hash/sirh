/** Définitions des indicateurs du "Tableau de bord RH Groupe" mensuel —
 * livrable "Définitions des indicateurs + sources de données" de la fiche
 * objectifs DACH 2026. Affichées sur /rapports/mensuel et reprises dans les
 * exports PDF et Excel, pour que chaque taux publié puisse être expliqué.
 *
 * Toute modification d'un calcul dans lib/rapportMensuel.ts doit être
 * reportée ici, sinon la définition affichée ne correspond plus au chiffre. */
export interface IndicateurDefinition {
  nom: string;
  definition: string;
  formule: string;
  source: string;
  frequence: string;
  remarque?: string;
}

export const INDICATEURS: IndicateurDefinition[] = [
  {
    nom: "Effectif",
    definition:
      "Nombre de collaborateurs actifs à la date de consultation (contrat en cours), hors recrues dont le contrat n'a pas encore commencé.",
    formule: "Nombre de collaborateurs actifs",
    source: "Neos (liste des contrats)",
    frequence: "Temps réel",
    remarque:
      "Photographie du jour : l'effectif d'un mois passé n'est pas reconstitué. Pour un mois antérieur, se reporter au fichier consolidé du personnel.",
  },
  {
    nom: "Recrutements du mois",
    definition:
      "Nombre de candidats dont le contrat est signé et dont la date de début de contrat tombe dans le mois considéré.",
    formule: "Nombre de contrats signés avec date de début dans le mois",
    source: "Pipeline de recrutement (colonnes « Contrat signé » et « Date début du contrat »)",
    frequence: "Mensuelle",
  },
  {
    nom: "Jours d'absence",
    definition:
      "Nombre de jours couverts, dans le mois, par les demandes de congés et d'absences validées.",
    formule: "Somme des jours des absences validées comprises dans le mois",
    source: "Module Congés & absences du SIRH (demandes au statut « validée »)",
    frequence: "Mensuelle",
    remarque: "Les jours sont comptés en jours calendaires, week-ends inclus.",
  },
  {
    nom: "Taux d'absentéisme",
    definition: "Part du temps de travail théorique du mois perdue en absences.",
    formule: "Jours d'absence ÷ (Effectif × Jours ouvrés du mois) × 100",
    source: "Module Congés & absences du SIRH + Neos",
    frequence: "Mensuelle",
    remarque: "Jours ouvrés = du lundi au vendredi, jours fériés non déduits.",
  },
  {
    nom: "Turnover",
    definition: "Nombre de départs du mois (fins de contrat, démissions, ruptures), saisi par la DACH.",
    formule: "Départs du mois ÷ Effectif × 100",
    source: "Saisie RH sur la page du rapport mensuel",
    frequence: "Mensuelle",
    remarque: "Le taux est calculé sur l'effectif à la date de consultation.",
  },
  {
    nom: "Formation",
    definition: "Taux de réalisation du plan de formation annuel.",
    formule: "Actions de formation réalisées ÷ Actions prévues au plan × 100",
    source: "Plan de formation annuel",
    frequence: "Mensuelle",
    remarque: "Aucun plan de formation déployé en 2026 : l'indicateur sera alimenté à partir du plan de formation 2027.",
  },
];
