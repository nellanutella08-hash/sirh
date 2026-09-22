import { getSession } from "@/lib/session";
import { requireMonContrat, fmtDate } from "@/lib/data";
import { PageHeader } from "@/components/KpiCard";

export default async function MonContratPage() {
  const session = await getSession();
  if (!session) return null;

  const contrats = await requireMonContrat(session);

  return (
    <>
      <PageHeader title="Mon contrat" subtitle="Documents contractuels enregistrés dans Neos" />
      <div className="mx-auto max-w-3xl animate-[fade-in_.2s_ease-out] p-6">
        {contrats.length === 0 ? (
          <div className="rounded-[14px] border border-v/10 bg-white p-8 text-center text-sm text-gm">
            Aucun contrat trouvé dans Neos pour ton compte.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {contrats.map((c, i) => (
              <div key={c.id} className="rounded-[14px] border border-v/10 bg-white p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-semibold text-nb">
                      {c.typeContrat} — {c.entite}
                      {i === 0 && contrats.length > 1 && (
                        <span className="ml-2 rounded-full bg-v/10 px-2 py-0.5 text-[10px] font-semibold text-v">
                          Le plus récent
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-gm">
                      {c.contractNumber && <>N° {c.contractNumber} — </>}
                      Du {fmtDate(c.dateDebut)} {c.dateFin ? `au ${fmtDate(c.dateFin)}` : "(sans fin renseignée)"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <FileLink href={c.contractFileUrl} label="Contrat signé" />
                  <FileLink href={c.jobDescriptionFileUrl} label="Fiche de poste" />
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-[11px] text-gm">
          Ces fichiers proviennent directement de Neos. En cas de document manquant ou erroné, contacte les
          Ressources Humaines.
        </p>
      </div>
    </>
  );
}

function FileLink({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return (
      <span className="rounded-lg bg-bg px-3 py-2 text-xs font-medium text-gm">{label} — non disponible</span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-lg bg-v px-3 py-2 text-xs font-medium text-white hover:bg-vm"
    >
      📄 Télécharger — {label}
    </a>
  );
}
