import { PageHeaderSkeleton } from "@/components/Skeleton";

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-v/10 ${className}`} />;
}

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="animate-[fade-in_.15s_ease-out] p-6">
        <div className="mb-6 flex items-center gap-4 rounded-[14px] bg-gl p-4">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-v/15" />
          <div className="flex-1">
            <Bar className="mb-2 h-4 w-48" />
            <Bar className="h-3 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-bg px-3 py-2.5">
              <Bar className="mb-2 h-2.5 w-20" />
              <Bar className="h-3.5 w-32" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
