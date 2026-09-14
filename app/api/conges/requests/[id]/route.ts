import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { getCongeRequest, updateCongeRequest, deleteCongeRequest, CACHE_ENABLED } from "@/lib/db";
import { sendCongeDecisionNotification } from "@/lib/zimbra";
import { getEmployes } from "@/lib/data";
import { NeosAuthError } from "@/lib/neos";

// Three tiers of access to an existing request:
// - RH: full access (avis hiérarchie, statut, justificatif) — the final visa.
// - The assigned manager: only avisHierarchie/avisHierarchieMotif — their
//   own avis opérationnel, nothing else.
// - The requester themselves: only justificatifPath — attaching their own
//   proof after the fact.
// Deletion stays RH-only.

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/conges/requests/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  const current = await getCongeRequest(session.tenantId, id);
  if (!current) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

  const body = await req.json();
  const rh = isRH(session);
  const isManager = !rh && session.userId === current.managerId;
  const isOwner = !rh && !isManager && session.userId === current.employeId;

  let patch: Record<string, unknown>;
  if (rh) {
    patch = body;
  } else if (isManager) {
    if (body?.avisHierarchie === undefined && body?.avisHierarchieMotif === undefined) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    patch = { avisHierarchie: body.avisHierarchie, avisHierarchieMotif: body.avisHierarchieMotif };
  } else if (isOwner) {
    if (body?.justificatifPath === undefined) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    patch = { justificatifPath: body.justificatifPath };
  } else {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const updated = await updateCongeRequest(session.tenantId, id, patch);
  if (!updated) return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });

  // "Notification: retour au collaborateur" — the last step of the
  // circuit, fired only on RH's own final visa (not the manager's avis).
  if (rh && patch.statut && patch.statut !== current.statut) {
    try {
      const employes = await getEmployes(session);
      const employe = employes.find((e) => e.id === updated.employeId);
      if (employe?.email && (updated.statut === "validee" || updated.statut === "refusee")) {
        await sendCongeDecisionNotification({
          employeEmail: employe.email,
          employeNom: updated.employeNom,
          motif: updated.motif,
          dateDebut: updated.dateDebut,
          dateFin: updated.dateFin,
          statut: updated.statut,
        });
      }
    } catch (err) {
      if (!(err instanceof NeosAuthError)) console.error("[conges] decision notification failed", err);
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/conges/requests/[id]">) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!isRH(session)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (!CACHE_ENABLED) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  }

  const { id } = await ctx.params;
  await deleteCongeRequest(session.tenantId, id);
  return NextResponse.json({ ok: true });
}
