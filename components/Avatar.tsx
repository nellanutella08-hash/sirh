"use client";

import { useState } from "react";
import { initials } from "@/lib/format";

export function Avatar({
  photoUrl,
  fullname,
  size = 32,
  className = "",
  bg = "bg-v",
}: {
  photoUrl?: string | null;
  fullname: string;
  size?: number;
  className?: string;
  bg?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={fullname}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${bg} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
    >
      {initials(fullname)}
    </div>
  );
}
