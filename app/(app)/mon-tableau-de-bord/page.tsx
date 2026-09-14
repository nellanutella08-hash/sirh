import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { requireEmploye, fmtDate } from "@/lib/data";
import {
  listDocumentRequestsForEmploye,
  listCongeRequestsForEmploye,
  listCongeRequestsManagedBy,
  CACHE_ENABLED,
} from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { AlerteBadge } from "@/components/Badge";
import { KpiCard } from "@/components/KpiCard";

export default async function MonTableauDeBordPage() {
  const session = await getSession();
  if (!session) return null;

  const employe = await requireEmploye(session, session.userId);
  if (!employe) notFound();

  const [mesDocuments, mesConges, congesEquipe] = CACHE_ENABLED
    ? await Promise.all([
        listDocumentRequestsForEmploye(session.tenantId, session.userId),
        listCongeRequestsForEmploye(session.tenantId, session.userId),
        listCongeRequestsManagedBy(session.tenantId, session.userId),
      ])
    : [[], [], []];

  const documentsEnCours = mesDocuments.filter((d) => d.statut !== "remise" && d.statut !== "refusee");
  const congesEnCours = mesConges.filter((c) => c.statut === "demandee");
  const congesAValider = congesEquipe.filter((c) => c.avisHierarchie === "en_attente");
  const mesChangementsDemandes = mesConges.filter((c) => c.avisHierarchie === "changement_demande");

  const aTraiter = [...mesChangementsDemandes, ...congesAValider];

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center gap-4 rounded-[14px] bg-gl p-4">
        <Avatar photoUrl={employe.photoUrl} fullname={employe.fullname} size={56} className="text-lg" />
        <div>
          <div className="text-[16px] font-semibold text-nb">Bonjour, {employe.prenoms || employe.fullname}</div>
          <div className="mt-0.5 text-xs text-gm">
            {employe.fonction} — {employe.entite}
          </div>
          {employe.alerte !== "ok" && employe.alerte !== "cdi" && (
            <div className="mt-1.5">
              <AlerteBadge alerte={employe.alerte} />
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="Documents en cours" value={String(documentsEnCours.length)} />
        <KpiCard label="Congés en cours" value={String(congesEnCours.length)} />
        <KpiCard
          label="Congés à valider"
          value={String(congesAValider.length)}
          variant={congesAValider.length > 0 ? "warn" : "default"}
        />
      </div>

      {aTraiter.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-[13px] font-semibold text-nb">À traiter</div>
          <div className="flex flex-col gap-2">
            {congesAValider.map((c) => (
              <Link
                key={c.id}
                href="/validations-conges"
                className="flex items-center justify-between rounded-[12px] border border-wn/30 bg-[#FFF8EC] px-4 py-2.5 text-xs hover:bg-[#FFF3DC]"
              >
                <span>
                  <span className="font-medium text-nb">{c.employeNom}</span>
                  <span className="text-gd"> — {c.motif}, du {fmtDate(c.dateDebut)} au {fmtDate(c.dateFin)}</span>
                </span>
                <span className="font-medium text-[#7A4A00]">Donner mon avis →</span>
              </Link>
            ))}
            {mesChangementsDemandes.map((c) => (
              <Link
                key={c.id}
                href="/mes-conges"
                className="flex items-center justify-between rounded-[12px] border border-wn/30 bg-[#FFF8EC] px-4 py-2.5 text-xs hover:bg-[#FFF3DC]"
              >
                <span>
                  <span className="font-medium text-nb">Votre congé</span>
                  <span className="text-gd"> — {c.motif}, du {fmtDate(c.dateDebut)} au {fmtDate(c.dateFin)} : changement de dates demandé</span>
                </span>
                <span className="font-medium text-[#7A4A00]">Modifier →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="mb-2 text-[13px] font-semibold text-nb">Mes demandes en cours</div>
        {documentsEnCours.length === 0 && congesEnCours.length === 0 ? (
          <div className="rounded-[12px] border border-v/10 bg-white px-4 py-6 text-center text-xs text-gm">
            Aucune demande en cours.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[14px] border border-v/10 bg-white">
            {documentsEnCours.map((d) => (
              <Link
                key={d.id}
                href="/mes-documents"
                className="flex items-center justify-between border-b border-v/5 px-4 py-2.5 text-xs last:border-none hover:bg-gl"
              >
                <span className="font-medium text-nb">Document — {d.typeDocument}</span>
                <span className="text-gm">{fmtDate(d.createdAt)}</span>
              </Link>
            ))}
            {congesEnCours.map((c) => (
              <Link
                key={c.id}
                href="/mes-conges"
                className="flex items-center justify-between border-b border-v/5 px-4 py-2.5 text-xs last:border-none hover:bg-gl"
              >
                <span className="font-medium text-nb">
                  Congé — {c.motif}, du {fmtDate(c.dateDebut)} au {fmtDate(c.dateFin)}
                </span>
                <span className="text-gm">{fmtDate(c.createdAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickLink href="/mon-profil" label="Mon profil" />
        <QuickLink href="/mes-documents" label="Mes documents" />
        <QuickLink href="/mes-conges" label="Mes congés" />
        <QuickLink href="/validations-conges" label="Validations congés" />
      </div>
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-[12px] border border-v/10 bg-white px-3.5 py-3 text-center text-xs font-medium text-v hover:bg-gl"
    >
      {label}
    </Link>
  );
}
