import { PageSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return <PageSkeleton kpis={0} charts={0} tableRows={8} />;
}
