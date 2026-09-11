import { PageHeaderSkeleton } from "@/components/Skeleton";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-v/10 ${className}`} />;
}

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="animate-[fade-in_.15s_ease-out] p-6">
        <Bar className="mb-4 h-8 w-64" />
        <div className="flex gap-3 overflow-x-auto">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-[260px] shrink-0">
              <Bar className="mb-2 h-3 w-24" />
              <Bar className="h-40 w-full rounded-[12px]" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
