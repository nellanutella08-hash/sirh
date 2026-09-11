import { PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <PageSkeleton kpis={5} charts={0} tableRows={6} />;
}
