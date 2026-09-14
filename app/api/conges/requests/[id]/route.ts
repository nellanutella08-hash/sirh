import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isRH } from "@/lib/authz";
import { getCongeRequest, updateCongeRequest, deleteCongeRequest, CACHE_ENABLED } from "@/lib/db";
import {
  sendCongeDecisionNotification,
  sendCongeChangeRequestedNotification,
  sendCongeManagerNotification,
  sendCongeAvisNotification,
} from "@/lib/zimbra";
import { getEmployes } from "@/lib/data";
import { NeosAuthError } from "@/lib/neos";

// Three tiers of access to an existing request:
// - RH: full access (avis hiérarchie, statut, justificatif) — the final visa.
// - The assigned manager: only avisHierarchie/avisHierarchieMotif — their
//   own avis opérationnel ("favorable", "defavorable", or
//   "changement_demande" to ask for different dates without an outright
//   refusal), nothing else.
// - The requester themselves: their own justificatif, or — only while the
//   manager has asked for a change — the dates themselves, which sends
//   the request back to "en_attente" for a fresh avis.
// Deletion stays RH-only.

function joursEntre(debut: string, fin: string): number {
  const j = Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 86_400_000) + 1;
  return j > 0 ? j : 0;
}

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
  let ownerChangedDates = false;

  let patch: Record<string, unknown>;
  if (rh) {
    patch = body;
  } else if (isManager) {
    if (body?.avisHierarchie === undefined && body?.avisHierarchieMotif === undefined) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    patch = { avisHierarchie: body.avisHierarchie, avisHierarchieMotif: body.avisHierarchieMotif };
  } else if (isOwner && body?.justificatifPath !== undefined) {
    patch = { justificatifPath: body.justificatifPath };
  } else if (
    isOwner &&
    current.avisHierarchie === "changement_demande" &&
    typeof body?.dateDebut === "string" &&
    typeof body?.dateFin === "string"
  ) {
    const jours = joursEntre(body.dateDebut, body.dateFin);
    if (jours <= 0) return NextResponse.json({ error: "Dates invalides" }, { status: 400 });
    // Resubmitting sends it back to the manager for a fresh avis — the
    // server resets this, not the client, so it can't be spoofed.
    ownerChangedDates = true;
    patch = {
      dateDebut: body.dateDebut,
      dateFin: body.dateFin,
      jours,
      avisHierarchie: "en_attente",
      avisHierarchieMotif: null,
    };
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

  // The manager gave their avis — RH's turn for the final visa.
  if (isManager && (patch.avisHierarchie === "favorable" || patch.avisHierarchie === "defavorable")) {
    try {
      await sendCongeAvisNotification({
        requestId: updated.id,
        employeNom: updated.employeNom,
        motif: updated.motif,
        dateDebut: updated.dateDebut,
        dateFin: updated.dateFin,
        jours: updated.jours,
        avis: patch.avisHierarchie,
      });
    } catch (err) {
      console.error("[conges] avis notification failed", err);
    }
  }

  // The manager asked for different dates — tell the employee directly.
  if (isManager && patch.avisHierarchie === "changement_demande") {
    try {
      const employes = await getEmployes(session);
      const employe = employes.find((e) => e.id === updated.employeId);
      if (employe?.email) {
        await sendCongeChangeRequestedNotification({
          employeEmail: employe.email,
          employeNom: updated.employeNom,
          motif: updated.motif,
          dateDebut: updated.dateDebut,
          dateFin: updated.dateFin,
          motifChangement: updated.avisHierarchieMotif,
        });
      }
    } catch (err) {
      if (!(err instanceof NeosAuthError)) console.error("[conges] change-requested notification failed", err);
    }
  }

  // The employee resubmitted new dates — the manager needs to look again.
  if (ownerChangedDates && updated.managerId) {
    try {
      const employes = await getEmployes(session);
      const manager = employes.find((e) => e.id === updated.managerId);
      if (manager?.email) {
        await sendCongeManagerNotification({
          managerEmail: manager.email,
          employeNom: updated.employeNom,
          motif: updated.motif,
          motifDetail: updated.motifDetail,
          dateDebut: updated.dateDebut,
          dateFin: updated.dateFin,
          jours: updated.jours,
        });
      }
    } catch (err) {
      if (!(err instanceof NeosAuthError)) console.error("[conges] manager re-notification failed", err);
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
