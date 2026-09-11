function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-v/10 ${className}`} />;
}

export function KpiGridSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[14px] border border-v/10 bg-white p-4">
          <Bar className="mb-3 h-3 w-20" />
          <Bar className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ChartGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[14px] border border-v/10 bg-white p-5">
          <Bar className="mb-4 h-3 w-32" />
          <Bar className="h-[220px] w-full" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="rounded-[14px] border border-v/10 bg-white">
      <div className="border-b border-v/10 px-5 py-3.5">
        <Bar className="h-3 w-48" />
      </div>
      <div className="divide-y divide-v/5 px-5 py-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <Bar className="h-3 w-1/4" />
            <Bar className="h-3 w-1/6" />
            <Bar className="h-3 w-1/6" />
            <Bar className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="sticky top-14 z-10 flex items-center gap-4 border-b border-v/10 bg-white px-6 py-4">
      <div>
        <Bar className="mb-2 h-4 w-40" />
        <Bar className="h-2.5 w-28" />
      </div>
    </div>
  );
}

export function PageSkeleton({
  kpis = 5,
  charts = 0,
  tableRows = 8,
}: {
  kpis?: number;
  charts?: number;
  tableRows?: number;
}) {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="animate-[fade-in_.15s_ease-out] p-6">
        {kpis > 0 && <KpiGridSkeleton count={kpis} />}
        {charts > 0 && (
          <div className="mb-6">
            <ChartGridSkeleton count={charts} />
          </div>
        )}
        {tableRows > 0 && <TableSkeleton rows={tableRows} />}
      </div>
    </>
  );
}
