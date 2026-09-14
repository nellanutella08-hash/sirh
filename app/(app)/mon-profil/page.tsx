import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireEmploye, fmtDate, fmtFCFA } from "@/lib/data";
import { ContratBadge, AlerteBadge, GenreBadge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";

const MARITAL_LABEL: Record<string, string> = {
  single: "Célibataire",
  married: "Marié(e)",
  divorced: "Divorcé(e)",
  widowed: "Veuf/Veuve",
};

export default async function MonProfilPage() {
  const session = await getSession();
  if (!session) return null;

  const employe = await requireEmploye(session, session.userId);
  if (!employe) notFound();

  return (
    <div className="mx-auto max-w-3xl p-6">
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
      </div>
    </div>
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
