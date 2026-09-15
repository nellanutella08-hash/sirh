"use client";

import { useRouter } from "next/navigation";

export function MonthPicker({ yearMonth }: { yearMonth: string }) {
  const router = useRouter();
  return (
    <input
      type="month"
      value={yearMonth}
      onChange={(e) => e.target.value && router.push(`/rapports/mensuel?month=${e.target.value}`)}
      className="rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-sm text-nb outline-none focus:border-v"
    />
  );
}
