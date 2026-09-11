import { PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <PageSkeleton kpis={4} charts={4} tableRows={0} />;
}
