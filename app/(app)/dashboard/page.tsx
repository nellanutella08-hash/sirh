import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEmployes, getKpis, fmtFCFA } from "@/lib/data";
import { listDocumentRequests, listCongeRequests, getPersonnelAffectations, CACHE_ENABLED } from "@/lib/db";
import { PageHeader, KpiCard } from "@/components/KpiCard";
import { DashboardCharts } from "@/components/DashboardCharts";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);

  const employes = await requireEmployes(session);
  const kpis = getKpis(employes);

  const [documentRequests, congeRequests, affectationsMap] = CACHE_ENABLED
    ? await Promise.all([
        listDocumentRequests(session.tenantId),
        listCongeRequests(session.tenantId),
        getPersonnelAffectations(session.tenantId),
      ])
    : [[], [], new Map()];
  const documentsATraiter = documentRequests.filter((r) => r.statut === "demandee").length;
  const congesATraiter = congeRequests.filter((r) => r.statut === "demandee").length;

  const affectations: Record<
    number,
    { regie: string | null; poleTechSupport: string | null; classification: "regie" | "hors_regie" | null; typeProjet: string | null }
  > = {};
  for (const [employeId, a] of affectationsMap) {
    affectations[employeId] = {
      regie: a.regie,
      poleTechSupport: a.poleTechSupport,
      classification: a.classification,
      typeProjet: a.typeProjet,
    };
  }

  return (
    <>
      <PageHeader title="Tableau de bord RH" subtitle="Groupe Synelia — données en direct depuis Neos" />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        {(kpis.expires > 0 || kpis.renouvellementImmediat > 0 || kpis.aRenouveler > 0) && (
          <div className="mb-5 flex cursor-pointer items-center gap-3 rounded-lg border border-[#FFD0B5] bg-[#FFF3EE] px-4 py-3 hover:bg-[#FFE8D8]">
            <span className="h-2 w-2 shrink-0 animate-[pulse-dot_2s_infinite] rounded-full bg-wn" />
            <div className="text-[13px] text-gd">
              <strong className="text-er">{kpis.expires} contrat(s) expiré(s)</strong>,{" "}
              <strong className="text-er">{kpis.renouvellementImmediat} à renouveler sous 14 jours</strong>{" "}
              et <strong className="text-wn">{kpis.aRenouveler} sous 90 jours</strong> — consultez la page
              Contrats &amp; Alertes.
            </div>
          </div>
        )}

        <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
          <KpiCard
            label="Effectif total"
            value={String(kpis.total)}
            sub="Collaborateurs actifs"
            href="/personnel"
          />
          <KpiCard
            label="CDI / Indéterminé"
            value={String(kpis.cdi)}
            variant="success"
            href="/personnel?alerte=cdi"
          />
          <KpiCard
            label="À renouveler (<14j)"
            value={String(kpis.renouvellementImmediat)}
            variant="danger"
            sub="Renouvellement immédiat"
            href="/contrats?alerte=a_renouveler"
          />
          <KpiCard
            label="À surveiller (90j)"
            value={String(kpis.aRenouveler)}
            variant="warn"
            sub="Urgents + attention"
            href="/contrats?alerte=surveiller"
          />
          <KpiCard
            label="Contrats expirés"
            value={String(kpis.expires)}
            variant="danger"
            href="/contrats?alerte=expiré"
          />
          <KpiCard
            label="Masse salariale nette"
            value={fmtFCFA(kpis.masseNette)}
            variant="mag"
            href="/masse-salariale"
          />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Demandes à traiter"
            value={String(documentsATraiter + congesATraiter)}
            variant={documentsATraiter + congesATraiter > 0 ? "warn" : "default"}
            sub="Documents + congés en attente"
          />
          <KpiCard
            label="Documents à traiter"
            value={String(documentsATraiter)}
            variant={documentsATraiter > 0 ? "mag" : "default"}
            href="/documents"
          />
          <KpiCard
            label="Congés à traiter"
            value={String(congesATraiter)}
            variant={congesATraiter > 0 ? "success" : "default"}
            href="/conges"
          />
        </div>

        <DashboardCharts employes={employes} affectations={affectations} />
      </div>
    </>
  );
}
