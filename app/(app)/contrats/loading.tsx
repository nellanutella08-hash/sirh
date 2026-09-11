import { PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <PageSkeleton kpis={6} charts={0} tableRows={8} />;
}
