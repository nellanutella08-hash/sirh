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
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-5 rounded-[14px] bg-gradient-to-br from-wn to-mg px-5 py-4">
        <div className="text-[16px] font-semibold text-white">Validations congés</div>
        <div className="mt-0.5 text-xs text-white/70">
          Demandes d&apos;absence de vos collaborateurs (avis hiérarchie)
        </div>
      </div>
      <ValidationsCongesBoard initialRequests={requests} />
    </div>
  );
}
