import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEmployes } from "@/lib/data";
import { listEvaluations, listCriteresSoftSkills, listCampagnes, CACHE_ENABLED } from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { EvaluationsConsolide } from "@/components/EvaluationsConsolide";

export default async function EvaluationsPage() {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);

  const [evaluations, employes, criteres, campagnes] = await Promise.all([
    CACHE_ENABLED ? listEvaluations(session.tenantId) : Promise.resolve([]),
    requireEmployes(session),
    CACHE_ENABLED ? listCriteresSoftSkills(session.tenantId) : Promise.resolve([]),
    CACHE_ENABLED ? listCampagnes(session.tenantId) : Promise.resolve([]),
  ]);

  const entitesDisponibles = Array.from(new Set(employes.map((e) => e.entite).filter(Boolean))).sort();

  return (
    <>
      <PageHeader
        title="Évaluations"
        subtitle="Fiches d'objectifs, auto-évaluation et notation — vue consolidée"
      />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        {!CACHE_ENABLED ? (
          <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center">
            <div className="mb-1 text-sm font-semibold text-nb">Base de données non configurée</div>
            <p className="mx-auto max-w-md text-xs text-gm">
              Le module Évaluations a besoin d&apos;une base Postgres (Neon) — Neos ne fournit aucune
              ressource d&apos;évaluation. Ajoutez <code>DATABASE_URL</code> dans les variables
              d&apos;environnement du projet.
            </p>
          </div>
        ) : (
          <EvaluationsConsolide
            initialEvaluations={evaluations}
            employes={employes.map((e) => ({
              id: e.id,
              fullname: e.fullname,
              entite: e.entite,
              fonction: e.fonction,
            }))}
            initialCriteres={criteres}
            initialCampagnes={campagnes}
            entitesDisponibles={entitesDisponibles}
          />
        )}
      </div>
    </>
  );
}
