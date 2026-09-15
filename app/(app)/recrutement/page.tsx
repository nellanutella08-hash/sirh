import { getSession } from "@/lib/session";
import { requireRH } from "@/lib/authz";
import { fetchPipelineRows, fetchDeparts, GoogleSheetError } from "@/lib/googleSheets";
import { PageHeader } from "@/components/KpiCard";
import { RecrutementPipeline } from "@/components/RecrutementPipeline";

export default async function RecrutementPage() {
  const session = await getSession();
  if (!session) return null;
  requireRH(session);

  const [pipelineResult, departsResult] = await Promise.allSettled([fetchPipelineRows(), fetchDeparts()]);

  const pipeline = pipelineResult.status === "fulfilled" ? pipelineResult.value : [];
  const errorPipeline =
    pipelineResult.status === "rejected"
      ? pipelineResult.reason instanceof GoogleSheetError
        ? pipelineResult.reason.message
        : "Erreur inattendue lors de la lecture du fichier Google Sheets."
      : null;

  const departs = departsResult.status === "fulfilled" ? departsResult.value : [];
  const errorDeparts =
    departsResult.status === "rejected"
      ? departsResult.reason instanceof GoogleSheetError
        ? departsResult.reason.message
        : "Erreur inattendue lors de la lecture du fichier Google Sheets."
      : null;

  return (
    <>
      <PageHeader title="Recrutement" subtitle="Pipeline des candidatures & départs (Google Sheets)" />
      <div className="animate-[fade-in_.2s_ease-out] p-6">
        <RecrutementPipeline
          pipeline={pipeline}
          departs={departs}
          errorPipeline={errorPipeline}
          errorDeparts={errorDeparts}
        />
      </div>
    </>
  );
}
