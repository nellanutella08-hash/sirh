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
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center gap-6 rounded-[16px] bg-gradient-to-br from-v to-vm p-6">
        <Avatar
          photoUrl={employe.photoUrl}
          fullname={employe.fullname}
          size={120}
          className="text-3xl ring-4 ring-white/20"
        />
        <div>
          <div className="text-[22px] font-semibold text-white">{employe.fullname}</div>
          <div className="mt-1 text-sm text-white/70">
            {employe.fonction} — {employe.entite}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <ContratBadge type={employe.contratType} />
            <AlerteBadge alerte={employe.alerte} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Identité" accent="bg-mg">
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
        </Section>

        <Section title="Poste & entité" accent="bg-v">
          <Detail label="Fonction" value={employe.fonction} />
          <Detail label="Entité" value={employe.entite} />
          <Detail label="Date d'entrée" value={fmtDate(employe.dateEntree)} />
          <Detail label="Manager" value={employe.managerNom || "—"} />
        </Section>

        <Section title="Contrat & rémunération" accent="bg-sc">
          <Detail label="N° de contrat" value={employe.contractNumber || "—"} />
          <Detail label="Type de contrat" value={<ContratBadge type={employe.contratType} />} />
          <Detail label="Date début contrat" value={fmtDate(employe.dateDebut)} />
          <Detail label="Date fin contrat" value={fmtDate(employe.dateFin)} />
          <Detail label="Salaire net" value={fmtFCFA(employe.salNet)} />
          <Detail label="Salaire brut" value={fmtFCFA(employe.salBrut)} />
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-v/10 bg-white">
      <div className="flex items-center gap-2 border-b border-v/10 px-4 py-3">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        <span className="text-[12px] font-semibold uppercase tracking-wide text-gd">{title}</span>
      </div>
      <div className="flex flex-col gap-2.5 p-4">{children}</div>
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
