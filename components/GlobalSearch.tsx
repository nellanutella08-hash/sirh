"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";

interface SearchEntry {
  id: number;
  fullname: string;
  entite: string;
  fonction: string;
  photoUrl: string | null;
}

const MAX_RESULTS = 8;

export function GlobalSearch() {
  const router = useRouter();
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  function ensureLoaded() {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetch("/api/search/index")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        if (Array.isArray(data)) setIndex(data);
      })
      .catch(() => {
        loadedRef.current = false; // allow retry on next focus
      });
  }

  useEffect(() => {
    // Prefetch the index right away (rather than waiting for focus) so the
    // very first keystroke already has data to filter against.
    ensureLoaded();
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(() => {
    if (!index || query.trim().length < 1) return [];
    const q = query.trim().toLowerCase();
    return index
      .filter((e) => `${e.fullname} ${e.fonction} ${e.entite}`.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [index, query]);

  function goTo(id: number) {
    router.push(`/personnel/${id}`);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      goTo(results[activeIdx]?.id ?? results[0].id);
    }
  }

  return (
    <div ref={rootRef} className="relative w-full max-w-[420px]">
      <div className="flex items-center gap-2 rounded-lg border border-v/15 bg-bg px-3 py-2">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="shrink-0 text-gm"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          placeholder="Rechercher un collaborateur..."
          onFocus={() => {
            ensureLoaded();
            setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-sm text-nb outline-none placeholder:text-gm"
        />
        {index === null && open && (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-v/20 border-t-v" />
        )}
      </div>

      {open && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-96 overflow-y-auto rounded-lg border border-v/10 bg-white shadow-[0_8px_32px_rgba(75,40,130,0.14)]">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gm">
              {index === null ? "Chargement…" : "Aucun résultat"}
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.id}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => goTo(r.id)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
                  i === activeIdx ? "bg-gl" : ""
                }`}
              >
                <Avatar photoUrl={r.photoUrl} fullname={r.fullname} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-nb">{r.fullname}</span>
                  <span className="block truncate text-[11px] text-gm">
                    {r.fonction} — {r.entite}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
