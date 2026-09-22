import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import type { NeosSession } from "@/lib/neos";
import { requireEmployes, getKpis, fmtFCFA } from "@/lib/data";
import {
  listDocumentRequests,
  listDocumentRequestsForEmploye,
  listCongeRequests,
  listCongeRequestsForEmploye,
  listCongeRequestsManagedBy,
  getCongeSolde,
  CACHE_ENABLED,
} from "@/lib/db";
import { fetchPipelineRows } from "@/lib/googleSheets";
import { PageHeader } from "@/components/KpiCard";
import { AccueilPortail, type AccueilTile } from "@/components/AccueilPortail";

export default async function AccueilPage() {
  const session = await getSession();
  if (!session) return null;
  const rh = isRH(session);

  const tiles = rh ? await buildRhTiles(session) : await buildCollabTiles(session);

  return (
    <>
      <PageHeader title="Accueil" subtitle="Vos modules, en un coup d'œil" hasSearchBarAbove={rh} />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <AccueilPortail tiles={tiles} />
      </div>
    </>
  );
}

async function buildRhTiles(session: NeosSession): Promise<AccueilTile[]> {
  const employes = await requireEmployes(session);
  const kpis = getKpis(employes);

  const [documentRequests, congeRequests, mesValidations, pipelineResult] = await Promise.all([
    CACHE_ENABLED ? listDocumentRequests(session.tenantId) : Promise.resolve([]),
    CACHE_ENABLED ? listCongeRequests(session.tenantId) : Promise.resolve([]),
    CACHE_ENABLED ? listCongeRequestsManagedBy(session.tenantId, session.userId) : Promise.resolve([]),
    // Best-effort: an external Google Sheets hiccup shouldn't take down the
    // whole home page for every user, just show "0" on this one tile.
    fetchPipelineRows().catch(() => []),
  ]);

  const documentsATraiter = documentRequests.filter((r) => r.statut === "demandee").length;
  const congesATraiter = congeRequests.filter((r) => r.statut === "demandee").length;
  const validationsATraiter = mesValidations.filter((r) => r.statut === "demandee").length;
  const alertesContrats = kpis.expires + kpis.renouvellementImmediat + kpis.aRenouveler;

  return [
    { href: "/personnel", label: "Personnel", icon: "users", color: "bg-v", value: String(kpis.total), sub: "collaborateurs actifs" },
    { href: "/organigramme", label: "Organigramme", icon: "sitemap", color: "bg-vd" },
    { href: "/recrutement", label: "Recrutement", icon: "userplus", color: "bg-sc", value: String(pipelineResult.length), sub: "candidats en pipeline" },
    { href: "/contrats", label: "Contrats & Alertes", icon: "file", color: "bg-wn", value: String(alertesContrats), sub: "à surveiller" },
    { href: "/conges", label: "Congés & Absences", icon: "calendar", color: "bg-mg", value: String(congesATraiter), sub: "demandes à traiter" },
    { href: "/validations-conges", label: "Validations congés", icon: "target", color: "bg-am", value: String(validationsATraiter), sub: "en attente de mon avis" },
    { href: "/evaluations", label: "Évaluations", icon: "flag", color: "bg-accent" },
    { href: "/documents", label: "Demandes de documents", icon: "docrequest", color: "bg-v", value: String(documentsATraiter), sub: "à traiter" },
    { href: "/masse-salariale", label: "Masse Salariale", icon: "trending", color: "bg-vd", value: fmtFCFA(kpis.masseNette) },
    { href: "/demographie", label: "Démographie", icon: "search", color: "bg-sc" },
    { href: "/rapports", label: "Rapports", icon: "report", color: "bg-wn" },
    { href: "/entites", label: "Entités juridiques", icon: "building", color: "bg-mg" },
  ];
}

async function buildCollabTiles(session: NeosSession): Promise<AccueilTile[]> {
  const [documentRequests, congeRequests, solde, mesValidations] = await Promise.all([
    CACHE_ENABLED ? listDocumentRequestsForEmploye(session.tenantId, session.userId) : Promise.resolve([]),
    CACHE_ENABLED ? listCongeRequestsForEmploye(session.tenantId, session.userId) : Promise.resolve([]),
    CACHE_ENABLED ? getCongeSolde(session.tenantId, session.userId) : Promise.resolve(null),
    CACHE_ENABLED ? listCongeRequestsManagedBy(session.tenantId, session.userId) : Promise.resolve([]),
  ]);

  const documentsEnCours = documentRequests.filter((r) => r.statut === "demandee").length;
  const congesEnCours = congeRequests.filter((r) => r.statut === "demandee").length;
  const validationsATraiter = mesValidations.filter((r) => r.statut === "demandee").length;

  const tiles: AccueilTile[] = [
    { href: "/mon-profil", label: "Mon profil", icon: "profile", color: "bg-v" },
    { href: "/mon-contrat", label: "Mon contrat", icon: "file", color: "bg-vd" },
    { href: "/mes-documents", label: "Mes documents", icon: "docrequest", color: "bg-mg", value: String(documentsEnCours), sub: "en cours" },
    {
      href: "/mes-conges",
      label: "Mes congés",
      icon: "calendar",
      color: "bg-sc",
      value: solde ? String(solde.solde) : undefined,
      sub: solde ? "jours disponibles" : `${congesEnCours} en cours`,
    },
    { href: "/evaluations?vue=perso", label: "Mes objectifs", icon: "flag", color: "bg-wn" },
    { href: "/annuaire", label: "Annuaire", icon: "users", color: "bg-am" },
    { href: "/organigramme", label: "Organigramme", icon: "sitemap", color: "bg-accent" },
  ];

  if (mesValidations.length > 0) {
    tiles.push({
      href: "/validations-conges",
      label: "Validations congés",
      icon: "target",
      color: "bg-v",
      value: String(validationsATraiter),
      sub: "en attente de mon avis",
    });
  }

  return tiles;
}
