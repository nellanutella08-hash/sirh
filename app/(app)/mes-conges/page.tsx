import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { requireEmploye } from "@/lib/data";
import { listCongeRequestsForEmploye, CACHE_ENABLED } from "@/lib/db";
import { MesCongesBoard } from "@/components/MesCongesBoard";

export default async function MesCongesPage() {
  const session = await getSession();
  if (!session) return null;

  const employe = await requireEmploye(session, session.userId);
  if (!employe) notFound();

  const requests = CACHE_ENABLED
    ? await listCongeRequestsForEmploye(session.tenantId, session.userId)
    : [];

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-5">
        <div className="text-[16px] font-semibold text-nb">Mes demandes de congés</div>
        <div className="mt-0.5 text-xs text-gm">Absences, permissions et suivi des validations</div>
      </div>
      <MesCongesBoard
        employe={{
          fullname: employe.fullname,
          fonction: employe.fonction,
          entite: employe.entite,
          contractNumber: employe.contractNumber,
        }}
        initialRequests={requests}
        dbEnabled={CACHE_ENABLED}
      />
    </div>
  );
}
