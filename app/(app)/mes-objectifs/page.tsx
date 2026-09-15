import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireEmploye, requireEmployes } from "@/lib/data";
import {
  listEvaluationsForEmploye,
  listEvaluationsManagedBy,
  listCriteresSoftSkills,
  listCampagnes,
  CACHE_ENABLED,
} from "@/lib/db";
import { EvaluationsWorkspace } from "@/components/EvaluationsWorkspace";

export default async function MesObjectifsPage() {
  const session = await getSession();
  if (!session) return null;

  const employe = await requireEmploye(session, session.userId);
  if (!employe) notFound();

  const [mesFiches, equipeFiches, allEmployes, criteres, campagnes] = await Promise.all([
    CACHE_ENABLED ? listEvaluationsForEmploye(session.tenantId, session.userId) : Promise.resolve([]),
    CACHE_ENABLED ? listEvaluationsManagedBy(session.tenantId, session.userId) : Promise.resolve([]),
    requireEmployes(session),
    CACHE_ENABLED ? listCriteresSoftSkills(session.tenantId) : Promise.resolve([]),
    CACHE_ENABLED ? listCampagnes(session.tenantId) : Promise.resolve([]),
  ]);

  const equipe = allEmployes
    .filter((e) => e.managerId === session.userId && e.id !== session.userId)
    .map((e) => ({ id: e.id, fullname: e.fullname, fonction: e.fonction }));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 rounded-[14px] bg-gradient-to-br from-v to-vm px-5 py-4">
        <div className="text-[16px] font-semibold text-white">Mes objectifs</div>
        <div className="mt-0.5 text-xs text-white/70">
          Fiches d&apos;objectifs, auto-évaluation et notation d&apos;entretien
        </div>
      </div>
      {!CACHE_ENABLED && (
        <div className="mb-4 rounded-[12px] border border-v/10 bg-white p-4 text-xs text-gm">
          Base de données non configurée (DATABASE_URL manquant) — le module Évaluations est
          indisponible.
        </div>
      )}
      <EvaluationsWorkspace
        mesFiches={mesFiches}
        equipeFiches={equipeFiches}
        equipe={equipe}
        criteresCatalogue={criteres}
        campagnes={campagnes.map((c) => ({ annee: c.annee, entites: c.entites, statut: c.statut }))}
      />
    </div>
  );
}
