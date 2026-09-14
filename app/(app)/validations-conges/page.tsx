import { getSession } from "@/lib/session";
import { listCongeRequestsManagedBy, CACHE_ENABLED } from "@/lib/db";
import { ValidationsCongesBoard } from "@/components/ValidationsCongesBoard";

export default async function ValidationsCongesPage() {
  const session = await getSession();
  if (!session) return null;

  const requests = CACHE_ENABLED
    ? await listCongeRequestsManagedBy(session.tenantId, session.userId)
    : [];

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-5">
        <div className="text-[16px] font-semibold text-nb">Validations congés</div>
        <div className="mt-0.5 text-xs text-gm">
          Demandes d&apos;absence de vos collaborateurs (avis hiérarchie)
        </div>
      </div>
      <ValidationsCongesBoard initialRequests={requests} />
    </div>
  );
}
