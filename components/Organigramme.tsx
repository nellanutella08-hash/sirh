"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Employe } from "@/lib/data";
import { Avatar } from "@/components/Avatar";

interface Node {
  employe: Employe;
  children: Node[];
}

// Ouvert par défaut à tous les niveaux (le graphe se déplie tout seul à
// l'ouverture de la page) — seule une fan-out vraiment hors norme (les
// ~180 rattachés directs de Fossou, faute de responsables de pôle
// nommés) reste repliée pour ne pas noyer le reste de l'arbre.
const AUTO_COLLAPSE_ABOVE = 20;

/** Builds the manager/report forest from the live Neos+overrides data
 * (same relationship "Par manager" on the Personnel page lets RH correct)
 * — never a static image, so it never drifts from what's actually
 * assigned. Cycle-guarded: a manager loop (bad data) breaks the chain
 * rather than recursing forever. */
function buildForest(employes: Employe[]): { roots: Node[]; orphelins: Employe[] } {
  const byId = new Map(employes.map((e) => [e.id, e]));
  const childrenOf = new Map<number, Employe[]>();
  const roots: Employe[] = [];
  const orphelins: Employe[] = [];

  for (const e of employes) {
    if (e.managerId != null && e.managerId !== e.id && byId.has(e.managerId)) {
      const arr = childrenOf.get(e.managerId) ?? [];
      arr.push(e);
      childrenOf.set(e.managerId, arr);
    } else if (e.managerId != null && !byId.has(e.managerId)) {
      orphelins.push(e);
    } else {
      roots.push(e);
    }
  }

  function build(e: Employe, ancestors: Set<number>): Node {
    const kids = (childrenOf.get(e.id) ?? [])
      .filter((k) => !ancestors.has(k.id)) // casse une boucle manager au lieu de boucler
      .sort((a, b) => a.fullname.localeCompare(b.fullname));
    const nextAncestors = new Set(ancestors).add(e.id);
    return { employe: e, children: kids.map((k) => build(k, nextAncestors)) };
  }

  return {
    roots: roots.sort((a, b) => a.fullname.localeCompare(b.fullname)).map((e) => build(e, new Set())),
    orphelins,
  };
}

function countDescendants(n: Node): number {
  return n.children.reduce((s, c) => s + 1 + countDescendants(c), 0);
}

/** For an active search: which nodes must stay expanded to reveal a match
 * (every ancestor of a match, plus a matching node itself when one of its
 * own descendants also matches), and which nodes are themselves a match
 * (for the highlight ring) — kept separate so an ancestor-only node opens
 * without being highlighted. */
function computeSearch(roots: Node[], q: string): { expandIds: Set<number>; matchIds: Set<number> } {
  const expandIds = new Set<number>();
  const matchIds = new Set<number>();

  function visit(n: Node, ancestors: number[]): boolean {
    const isMatch = n.employe.fullname.toLowerCase().includes(q) || n.employe.fonction.toLowerCase().includes(q);
    if (isMatch) matchIds.add(n.employe.id);
    let descendantMatch = false;
    for (const c of n.children) {
      if (visit(c, [...ancestors, n.employe.id])) descendantMatch = true;
    }
    const matchedHere = isMatch || descendantMatch;
    if (matchedHere) {
      for (const a of ancestors) expandIds.add(a);
      if (descendantMatch) expandIds.add(n.employe.id);
    }
    return matchedHere;
  }
  for (const r of roots) visit(r, []);
  return { expandIds, matchIds };
}

function NodeBox({ node, open, onToggle, highlight }: { node: Node; open: boolean; onToggle: () => void; highlight: boolean }) {
  const e = node.employe;
  const total = countDescendants(node);
  return (
    <div
      className={`flex w-[190px] flex-col items-center gap-1 rounded-[12px] border bg-white p-2.5 text-center shadow-sm ${
        highlight ? "border-v ring-2 ring-v/30" : "border-v/10"
      }`}
    >
      <Avatar photoUrl={e.photoUrl} fullname={e.fullname} size={36} />
      <Link href={`/personnel/${e.id}`} className="text-[12px] font-semibold text-nb hover:text-v hover:underline">
        {e.fullname}
      </Link>
      <div className="text-[10px] leading-tight text-gm">{e.fonction}</div>
      <div className="text-[9px] text-gm">{e.entite}</div>
      {node.children.length > 0 && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 rounded-full bg-bg2 px-2 py-0.5 text-[10px] font-semibold text-v hover:bg-gl"
        >
          {open ? "▲ Réduire" : `▼ ${node.children.length} direct${node.children.length > 1 ? "s" : ""} (${total} au total)`}
        </button>
      )}
    </div>
  );
}

function TreeNode({
  node,
  collapsedIds,
  onToggle,
  searching,
  expandIds,
  matchIds,
}: {
  node: Node;
  collapsedIds: Set<number>;
  onToggle: (id: number) => void;
  searching: boolean;
  expandIds: Set<number>;
  matchIds: Set<number>;
}) {
  const id = node.employe.id;
  const defaultOpen = node.children.length <= AUTO_COLLAPSE_ABOVE;
  const open = searching ? expandIds.has(id) : collapsedIds.has(id) ? !defaultOpen : defaultOpen;

  return (
    <li>
      <NodeBox node={node} open={open} onToggle={() => onToggle(id)} highlight={matchIds.has(id)} />
      {open && node.children.length > 0 && (
        <ul>
          {node.children.map((c) => (
            <TreeNode
              key={c.employe.id}
              node={c}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
              searching={searching}
              expandIds={expandIds}
              matchIds={matchIds}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** RH-only visual org chart, dérivé des vraies affectations manager/
 * collaborateur (jamais une image statique) — pour repérer d'un coup
 * d'œil un rattachement qui ne colle pas à l'organigramme fonctionnel
 * réel, avant d'ouvrir le module Évaluations aux équipes. */
export function Organigramme({ employes }: { employes: Employe[] }) {
  const { roots, orphelins } = useMemo(() => buildForest(employes), [employes]);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  function onToggle(id: number) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const q = search.trim().toLowerCase();
  const { expandIds, matchIds } = useMemo(() => (q ? computeSearch(roots, q) : { expandIds: new Set<number>(), matchIds: new Set<number>() }), [roots, q]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-v/10 bg-white px-5 py-3.5">
        <span className="text-[13px] font-semibold text-nb">
          {roots.length} racine(s) — {employes.length} collaborateurs
        </span>
        {orphelins.length > 0 && (
          <span className="rounded-full bg-wn/15 px-2 py-0.5 text-[11px] font-semibold text-[#8F5500]">
            ⚠ {orphelins.length} rattaché(s) à un manager introuvable — voir Personnel → Par manager
          </span>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un nom ou une fonction…"
          className="ml-auto rounded-lg border border-v/15 bg-bg px-3 py-1.5 text-xs text-nb outline-none focus:border-v"
        />
      </div>

      {q && matchIds.size === 0 && (
        <div className="rounded-[14px] border border-v/10 bg-white p-6 text-center text-xs text-gm">
          Aucun résultat pour « {search} ».
        </div>
      )}

      <div className="overflow-x-auto rounded-[14px] border border-v/10 bg-white p-6">
        <ul className="orgchart">
          {roots.map((r) => (
            <TreeNode
              key={r.employe.id}
              node={r}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
              searching={Boolean(q)}
              expandIds={expandIds}
              matchIds={matchIds}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
