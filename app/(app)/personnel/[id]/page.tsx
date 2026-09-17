import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { requireEmploye, fmtDate, fmtFCFA } from "@/lib/data";
import { isEnConge } from "@/lib/format";
import { listCongeRequestsForEmploye, getPersonnelAffectation, CACHE_ENABLED } from "@/lib/db";
import { PageHeader } from "@/components/KpiCard";
import { AlerteBadge, ContratBadge, GenreBadge, EnCongeBadge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { ManagerField } from "@/components/ManagerField";
import { AffectationField } from "@/components/AffectationField";
import { BackButton } from "@/components/BackButton";

const STATUT_LABEL: Record<string, { label: string; bg: string; fg: string }> = {
  demandee: { label: "Demandée", bg: "#EEF0F8", fg: "#3A2A6A" },
  validee: { label: "Validée", bg: "#E6FAF4", fg: "#0A5C3A" },
  refusee: { label: "Refusée", bg: "#FDECEA", fg: "#8B1A1A" },
};

const MARITAL_LABEL: Record<string, string> = {
  single: "Célibataire",
  married: "Marié(e)",
  divorced: "Divorcé(e)",
  widowed: "Veuf/Veuve",
};

export default async function PersonnelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return null;
  requireRH(session);

  const employe = await requireEmploye(session, Number(id));
  if (!employe) notFound();

  const congeRequests = CACHE_ENABLED
    ? await listCongeRequestsForEmploye(session.tenantId, employe.id)
    : [];
  const enConge = isEnConge(congeRequests);
  const affectation = CACHE_ENABLED
    ? await getPersonnelAffectation(session.tenantId, employe.id)
    : null;

  return (
    <>
      <PageHeader
        title={employe.fullname}
        subtitle={employe.fonction}
        actions={<BackButton fallbackHref="/personnel" label="← Retour" />}
      />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <div className="mb-6 flex items-center gap-4 rounded-[14px] bg-gl p-4">
          <Avatar photoUrl={employe.photoUrl} fullname={employe.fullname} size={56} className="text-lg" />
          <div>
            <div className="text-[16px] font-semibold text-nb">{employe.fullname}</div>
            <div className="mt-0.5 text-xs text-gm">
              {employe.fonction} — {employe.entite}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <ContratBadge type={employe.contratType} />
              <AlerteBadge alerte={employe.alerte} />
              {enConge && <EnCongeBadge />}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Detail label="Email" value={employe.email || "—"} />
          <Detail label="Téléphone" value={employe.telephone || "—"} />
          <Detail label="Genre" value={<GenreBadge genre={employe.genre} />} />
          <Detail
            label="Statut matrimonial"
            value={
              employe.statutMatrimonial
                ? (MARITAL_LABEL[employe.statutMatrimonial] ?? employe.statutMatrimonial)
                : "—"
            }
          />
          <Detail label="Nationalité" value={employe.nationality || "—"} />
          <Detail label="Date de naissance" value={fmtDate(employe.dateNaissance)} />
          <Detail label="Date d'entrée" value={fmtDate(employe.dateEntree)} />
          <Detail label="Entité" value={employe.entite} />
          <Detail label="Fonction" value={employe.fonction} />
          <Detail label="N° de contrat" value={employe.contractNumber || "—"} />
          <Detail label="Date début contrat" value={fmtDate(employe.dateDebut)} />
          <Detail label="Date fin contrat" value={fmtDate(employe.dateFin)} />
          <Detail label="Salaire net" value={fmtFCFA(employe.salNet)} />
          <Detail label="Salaire brut" value={fmtFCFA(employe.salBrut)} />
          <ManagerField
            employeId={employe.id}
            managerId={employe.managerId}
            managerNom={employe.managerNom}
          />
          <AffectationField employeId={employe.id} affectation={affectation} />
        </div>

        <div className="mt-6 overflow-hidden rounded-[14px] border border-v/10 bg-white">
          <div className="border-b border-v/10 px-4 py-3 text-[13px] font-semibold text-nb">
            Historique des congés
          </div>
          {congeRequests.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gm">Aucune demande de congé.</div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-bg">
                  {["Motif", "Du", "Au", "Jours", "Statut"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-3.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gd"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {congeRequests.map((r) => {
                  const s = STATUT_LABEL[r.statut];
                  return (
                    <tr key={r.id} className="border-b border-v/5 last:border-none">
                      <td className="px-3.5 py-2 font-medium text-nb">
                        {r.motif}
                        {r.motifDetail && <span className="text-gm"> — {r.motifDetail}</span>}
                        {r.motif2 && (
                          <div className="mt-0.5 text-[11px] font-normal text-gm">
                            + {r.motif2}
                            {r.motifDetail2 && ` — ${r.motifDetail2}`} ({fmtDate(r.dateDebut2)} au{" "}
                            {fmtDate(r.dateFin2)}, {r.jours2}j)
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2 text-nb">{fmtDate(r.dateDebut)}</td>
                      <td className="whitespace-nowrap px-3.5 py-2 text-nb">{fmtDate(r.dateFin)}</td>
                      <td className="px-3.5 py-2 text-nb">{r.jours}</td>
                      <td className="px-3.5 py-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: s.bg, color: s.fg }}
                        >
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-bg px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gm">{label}</div>
      <div className="text-[13px] font-medium text-nb">{value}</div>
    </div>
  );
}
