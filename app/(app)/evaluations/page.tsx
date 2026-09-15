import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { requireEmploye, requireEmployes } from "@/lib/data";
import {
  listEvaluations,
  listEvaluationsForEmploye,
  listEvaluationsManagedBy,
  listCriteresSoftSkills,
  listCampagnes,
  CACHE_ENABLED,
} from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { EvaluationsHub } from "@/components/EvaluationsHub";

export default async function EvaluationsPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;

  const employe = await requireEmploye(session, session.userId);
  if (!employe) notFound();

  const rh = isRH(session);
  const { vue } = await searchParams;
  const allEmployes = await requireEmployes(session);
  const equipe = allEmployes
    .filter((e) => e.managerId === session.userId && e.id !== session.userId)
    .map((e) => ({ id: e.id, fullname: e.fullname, fonction: e.fonction }));

  const [mesFiches, equipeFiches, allFiches, criteres, campagnes] = await Promise.all([
    CACHE_ENABLED ? listEvaluationsForEmploye(session.tenantId, session.userId) : Promise.resolve([]),
    CACHE_ENABLED && equipe.length > 0 ? listEvaluationsManagedBy(session.tenantId, session.userId) : Promise.resolve([]),
    CACHE_ENABLED && rh ? listEvaluations(session.tenantId) : Promise.resolve([]),
    CACHE_ENABLED ? listCriteresSoftSkills(session.tenantId) : Promise.resolve([]),
    CACHE_ENABLED ? listCampagnes(session.tenantId) : Promise.resolve([]),
  ]);

  const managerIds = new Set(allEmployes.map((e) => e.managerId).filter((id): id is number => id != null));
  const entitesDisponibles = Array.from(new Set(allEmployes.map((e) => e.entite).filter(Boolean))).sort();

  // Le menu propose deux entrées vers cette même page : "Évaluations" (accès
  // RH/admin) et "Mes objectifs" (?vue=perso, mon espace personnel — mes
  // fiches, celles de mon équipe le cas échéant) — sans le paramètre, la
  // vue par défaut suit le rôle (RH d'abord, sinon manager, sinon employé).
  const initialVue = vue === "perso" ? (equipe.length > 0 ? "manager" : "employe") : undefined;

  return (
    <>
      <PageHeader title="Évaluations" subtitle="Fiches d'objectifs, auto-évaluation et notation" />
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
          <EvaluationsHub
            isRH={rh}
            isManager={equipe.length > 0}
            mesFiches={mesFiches}
            equipeFiches={equipeFiches}
            equipe={equipe}
            allFiches={allFiches}
            employesRH={
              rh
                ? allEmployes.map((e) => ({
                    id: e.id,
                    fullname: e.fullname,
                    entite: e.entite,
                    fonction: e.fonction,
                    estManager: managerIds.has(e.id),
                  }))
                : []
            }
            initialCriteres={criteres}
            initialCampagnes={campagnes}
            entitesDisponibles={entitesDisponibles}
            initialVue={initialVue}
          />
        )}
      </div>
    </>
  );
}
