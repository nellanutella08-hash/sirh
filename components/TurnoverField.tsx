"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Turnover has no data source anywhere (Neos only ever exposes the
 * current roster) — RH enters the month's départs by hand here, or once
 * imported from a historical file, corrects it the same way. */
export function TurnoverField({
  yearMonth,
  departs,
  commentaire,
}: {
  yearMonth: string;
  departs: number | null;
  commentaire: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(departs ?? ""));
  const [comment, setComment] = useState(commentaire ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/rapports/turnover", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yearMonth,
          departs: Number(value) || 0,
          commentaire: comment || null,
        }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg bg-bg px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-gm">
            Turnover (saisie manuelle)
          </div>
          <button onClick={() => setEditing(true)} className="text-[11px] font-medium text-v hover:underline">
            Modifier
          </button>
        </div>
        <div className="text-[22px] font-semibold text-nb">
          {departs != null ? departs : "—"}
          <span className="ml-1 text-xs font-normal text-gm">départ(s)</span>
        </div>
        {commentaire && <div className="text-xs text-gm">{commentaire}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-v/20 bg-white px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gm">
        Turnover — {yearMonth}
      </div>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Nombre de départs"
        className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-v"
      />
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Commentaire (optionnel)"
        className="rounded-lg border border-v/15 bg-bg px-2.5 py-1.5 text-xs outline-none focus:border-v"
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-v px-2.5 py-1 text-[11px] font-medium text-white hover:bg-vm disabled:opacity-60"
        >
          Enregistrer
        </button>
        <button onClick={() => setEditing(false)} disabled={saving} className="rounded-md px-2.5 py-1 text-[11px] text-gm">
          Annuler
        </button>
      </div>
    </div>
  );
}
