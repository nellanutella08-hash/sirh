function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-v/10 ${className}`} />;
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl p-6">
      <Bar className="mb-1 h-4 w-56" />
      <Bar className="mb-5 h-3 w-40" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        <Bar className="h-48 w-full rounded-[14px]" />
        <Bar className="h-48 w-full rounded-[14px]" />
      </div>
    </div>
  );
}
