"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface EmployeOption {
  id: number;
  fullname: string;
}

export function ManagerField({
  employeId,
  managerId,
  managerNom,
}: {
  employeId: number;
  managerId: number | null;
  managerNom: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [employes, setEmployes] = useState<EmployeOption[] | null>(null);
  const [selected, setSelected] = useState(managerId ? String(managerId) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing || employes) return;
    fetch("/api/search/index")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setEmployes(data))
      .catch(() => {});
  }, [editing, employes]);

  async function save() {
    setSaving(true);
    try {
      const emp = employes?.find((e) => String(e.id) === selected);
      await fetch(`/api/personnel/${employeId}/manager`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerId: emp ? emp.id : null, managerNom: emp?.fullname ?? null }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function revertToNeos() {
    setSaving(true);
    try {
      await fetch(`/api/personnel/${employeId}/manager`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerId: null }),
      });
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-0.5 rounded-lg bg-bg px-3 py-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gm">Manager</div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-nb">{managerNom || "—"}</span>
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] font-medium text-v hover:underline"
          >
            Modifier
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-v/20 bg-white px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gm">Manager</div>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="rounded-lg border border-v/15 bg-bg px-2 py-1.5 text-xs outline-none focus:border-v"
      >
        <option value="">Aucun</option>
        {employes
          ?.filter((e) => e.id !== employeId)
          .map((e) => (
            <option key={e.id} value={e.id}>
              {e.fullname}
            </option>
          ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-v px-2.5 py-1 text-[11px] font-medium text-white hover:bg-vm disabled:opacity-60"
        >
          Enregistrer
        </button>
        <button
          onClick={revertToNeos}
          disabled={saving}
          className="rounded-md border border-v/15 px-2.5 py-1 text-[11px] text-gm"
        >
          Revenir à Neos
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={saving}
          className="rounded-md px-2.5 py-1 text-[11px] text-gm"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
