import "server-only";

const HOST = process.env.ZIMBRA_HOST;
const USER = process.env.ZIMBRA_USER;
const PASS = process.env.ZIMBRA_PASS;

// The distribution address the whole RH team reads, not the single account
// used to authenticate/send — so notifications reach everyone regardless
// of which mailbox is configured to send them.
const NOTIFY_TO = "rh@synelia.tech";

// Shown as the sender's display name so these read as coming from the app,
// not personally from whoever's Zimbra account is configured to send them.
const FROM_DISPLAY_NAME = "SIRH";

const APP_HOST =
  process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "sirh-nine.vercel.app";

export const ZIMBRA_NOTIFICATIONS_ENABLED = Boolean(HOST && USER && PASS);

async function soapPost(payload: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`https://${HOST}/service/soap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await res.json();
  const fault = (data as { Body?: { Fault?: { Reason?: { Text?: string } } } })?.Body?.Fault;
  if (fault) throw new Error(`Zimbra fault: ${fault.Reason?.Text ?? "erreur inconnue"}`);
  return data;
}

async function zimbraAuthToken(): Promise<string> {
  const data = await soapPost({
    Body: {
      AuthRequest: {
        _jsns: "urn:zimbraAccount",
        account: { by: "name", _content: USER },
        password: { _content: PASS },
      },
    },
  });
  const body = data.Body as { AuthResponse: { authToken: { _content: string }[] } };
  return body.AuthResponse.authToken[0]._content;
}

/** Uploads a file to Zimbra's content servlet ahead of sending, so it can
 * be referenced as a real attachment (not just a download link) on the
 * message — used to email a generated document straight to the
 * collaborator. Returns the attachment id ("aid") SendMsgRequest expects. */
async function uploadZimbraAttachment(
  token: string,
  filename: string,
  contentType: string,
  data: Buffer
): Promise<string> {
  const res = await fetch(`https://${HOST}/service/upload?fmt=raw`, {
    method: "POST",
    headers: {
      Cookie: `ZM_AUTH_TOKEN=${token}`,
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: new Uint8Array(data),
  });
  const text = await res.text();
  const match = text.match(/"aid"\s*:\s*"([^"]+)"/);
  if (!match) throw new Error(`Échec de l'upload de la pièce jointe Zimbra : ${text.slice(0, 200)}`);
  return match[1];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendEmail(
  subject: string,
  textBody: string,
  htmlBody: string,
  to: string = NOTIFY_TO,
  attachment?: { filename: string; contentType: string; data: Buffer }
): Promise<void> {
  if (!ZIMBRA_NOTIFICATIONS_ENABLED) return;
  try {
    const token = await zimbraAuthToken();
    let attach: { aid: string } | undefined;
    if (attachment) {
      try {
        const aid = await uploadZimbraAttachment(
          token,
          attachment.filename,
          attachment.contentType,
          attachment.data
        );
        attach = { aid };
      } catch (err) {
        // A failed attachment upload shouldn't block the notification
        // itself — the email still goes out (with its "voir dans le
        // SIRH" link) even without the file joined to it.
        console.error("[zimbra] échec de la pièce jointe, envoi sans fichier joint", err);
      }
    }
    await soapPost({
      Header: { context: { _jsns: "urn:zimbra", authToken: token } },
      Body: {
        SendMsgRequest: {
          _jsns: "urn:zimbraMail",
          m: {
            e: [
              { t: "f", a: USER, p: FROM_DISPLAY_NAME },
              { t: "t", a: to },
            ],
            su: { _content: subject },
            mp: {
              ct: "multipart/alternative",
              mp: [
                { ct: "text/plain", content: { _content: textBody } },
                { ct: "text/html", content: { _content: htmlBody } },
              ],
            },
            ...(attach ? { attach } : {}),
          },
        },
      },
    });
  } catch (err) {
    console.error("[zimbra] échec d'envoi de la notification", err);
  }
}

/** Shared HTML shell for these notification emails: a colored header, a
 * bold intro line naming the requester, a series of labelled sections, and
 * a CTA button back into the relevant part of the SIRH. */
function renderNotificationHtml(params: {
  title: string;
  intro: string;
  sections: { label: string; html: string }[];
  ctaPath: string;
}): string {
  const { title, intro, sections, ctaPath } = params;
  return `
<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:#4b2882;padding:16px 24px;border-radius:10px 10px 0 0;">
    <div style="color:#ffffff;font-size:15px;font-weight:600;">${escapeHtml(title)}</div>
  </div>
  <div style="border:1px solid #eeecf5;border-top:none;border-radius:0 0 10px 10px;padding:22px 24px;background:#ffffff;">
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#1c1c2e;">${intro}</p>
    ${sections
      .map(
        (s) => `
    <div style="margin:0 0 14px;">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#9a90a8;margin-bottom:6px;">
        ${escapeHtml(s.label)}
      </div>
      ${s.html}
    </div>`
      )
      .join("")}
    <a href="https://${APP_HOST}${ctaPath}" style="display:inline-block;margin-top:4px;background:#4b2882;color:#ffffff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:500;">
      Voir dans le SIRH
    </a>
  </div>
</div>`;
}

/** Best-effort notification email to the RH team (rh@synelia.tech) whenever
 * someone submits one or more document requests for themselves via the SIRH
 * — never throws, so an email outage can't break the action that triggered
 * it. One email per submission, listing every document type requested. */
export async function sendDocumentRequestNotification(params: {
  employeNom: string;
  typeDocuments: string[];
  motif: string;
}): Promise<void> {
  const { employeNom, typeDocuments, motif } = params;

  const subject = `[SIRH] Nouvelle demande de document — ${employeNom}`;

  const textBody =
    `${employeNom} vient de soumettre une demande de document via le SIRH.\n\n` +
    `Document(s) demandé(s) : ${typeDocuments.join(", ")}\n` +
    `Motif : ${motif}\n\n` +
    `Voir dans le SIRH : https://${APP_HOST}/documents`;

  const htmlBody = renderNotificationHtml({
    title: "Nouvelle demande de document",
    intro: `<strong>${escapeHtml(employeNom)}</strong> vient de soumettre une demande de document via le SIRH.`,
    sections: [
      {
        label: "Document(s) demandé(s)",
        html: `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6;color:#1c1c2e;">${typeDocuments
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join("")}</ul>`,
      },
      {
        label: "Motif",
        html: `<p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">${escapeHtml(motif)}</p>`,
      },
    ],
    ctaPath: "/documents",
  });

  await sendEmail(subject, textBody, htmlBody);
}

/** Sent to the requester themselves as soon as RH attaches the finished
 * file to their request (whether via the automated "Envoyer" flow on the
 * generation page, or by manually joining a scanned/signed copy) — the
 * "your document is ready" step that was previously missing entirely. */
export async function sendDocumentReadyNotification(params: {
  employeEmail: string;
  employeNom: string;
  typeDocument: string;
  attachment?: { filename: string; contentType: string; data: Buffer };
}): Promise<void> {
  const { employeEmail, employeNom, typeDocument, attachment } = params;

  const subject = `[SIRH] Votre document est prêt — ${typeDocument}`;

  const textBody =
    `Bonjour ${employeNom},\n\n` +
    `Votre document « ${typeDocument} » est prêt${attachment ? ", vous le trouverez en pièce jointe" : ""}.\n\n` +
    `Le retrouver dans le SIRH : https://${APP_HOST}/mes-documents`;

  const htmlBody = renderNotificationHtml({
    title: "Votre document est prêt",
    intro: `Bonjour <strong>${escapeHtml(employeNom)}</strong>, votre document est prêt${attachment ? ", vous le trouverez en pièce jointe" : ""}.`,
    sections: [
      {
        label: "Document",
        html: `<p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">${escapeHtml(typeDocument)}</p>`,
      },
    ],
    ctaPath: "/mes-documents",
  });

  await sendEmail(subject, textBody, htmlBody, employeEmail, attachment);
}

/** Same idea as sendDocumentRequestNotification, for a leave/absence
 * request ("demande de congés") — one consolidated email per submission. */
export async function sendCongeRequestNotification(params: {
  requestId: string;
  employeNom: string;
  motif: string;
  motifDetail: string | null;
  dateDebut: string;
  dateFin: string;
  jours: number;
}): Promise<void> {
  const { requestId, employeNom, motif, motifDetail, dateDebut, dateFin, jours } = params;
  const motifFull = motifDetail ? `${motif} (${motifDetail})` : motif;
  const ctaPath = `/conges?tab=demandes&request=${requestId}`;

  const subject = `[SIRH] Nouvelle demande de congé — ${employeNom}`;

  const textBody =
    `${employeNom} vient de soumettre une demande d'absence via le SIRH.\n\n` +
    `Motif : ${motifFull}\n` +
    `Du ${dateDebut} au ${dateFin} (${jours} jour${jours > 1 ? "s" : ""})\n\n` +
    `Voir dans le SIRH : https://${APP_HOST}${ctaPath}`;

  const htmlBody = renderNotificationHtml({
    title: "Nouvelle demande de congé",
    intro: `<strong>${escapeHtml(employeNom)}</strong> vient de soumettre une demande d'absence via le SIRH.`,
    sections: [
      {
        label: "Motif",
        html: `<p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">${escapeHtml(motifFull)}</p>`,
      },
      {
        label: "Dates",
        html: `<p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">Du <strong>${escapeHtml(dateDebut)}</strong> au <strong>${escapeHtml(dateFin)}</strong> — ${jours} jour${jours > 1 ? "s" : ""}</p>`,
      },
    ],
    ctaPath,
  });

  await sendEmail(subject, textBody, htmlBody);
}

/** Sent to RH (rh@synelia.tech) as soon as the manager gives their avis
 * opérationnel (favorable or défavorable) — that's the cue for RH's own
 * final visa, the next step of the circuit, so it deep-links straight to
 * this request in "Demandes & Approbations" rather than the general
 * Congés tab. Skipped for "changement_demande", which has its own
 * employee-facing notification instead (sendCongeChangeRequestedNotification). */
export async function sendCongeAvisNotification(params: {
  requestId: string;
  employeNom: string;
  motif: string;
  dateDebut: string;
  dateFin: string;
  jours: number;
  avis: "favorable" | "defavorable";
}): Promise<void> {
  const { requestId, employeNom, motif, dateDebut, dateFin, jours, avis } = params;
  const ctaPath = `/conges?tab=demandes&request=${requestId}`;
  const avisLabel = avis === "favorable" ? "favorable" : "défavorable";

  const subject = `[SIRH] Avis ${avisLabel} du manager — ${employeNom}, visa RH requis`;

  const textBody =
    `Le manager de ${employeNom} a donné un avis ${avisLabel} sur sa demande d'absence.\n\n` +
    `Motif : ${motif}\n` +
    `Du ${dateDebut} au ${dateFin} (${jours} jour${jours > 1 ? "s" : ""})\n\n` +
    `Votre visa final est requis : https://${APP_HOST}${ctaPath}`;

  const htmlBody = renderNotificationHtml({
    title: "Visa RH requis",
    intro: `Le manager de <strong>${escapeHtml(employeNom)}</strong> a donné un avis <strong>${avisLabel}</strong> sur sa demande d'absence — votre visa final est maintenant requis.`,
    sections: [
      {
        label: "Motif",
        html: `<p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">${escapeHtml(motif)}</p>`,
      },
      {
        label: "Dates",
        html: `<p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">Du <strong>${escapeHtml(dateDebut)}</strong> au <strong>${escapeHtml(dateFin)}</strong> — ${jours} jour${jours > 1 ? "s" : ""}</p>`,
      },
    ],
    ctaPath,
  });

  await sendEmail(subject, textBody, htmlBody);
}

/** Sent directly to the assigned manager (not rh@synelia.tech) as soon as a
 * congé request is filed — regardless of who filed it — since they're the
 * one who needs to give their avis opérationnel next. */
export async function sendCongeManagerNotification(params: {
  managerEmail: string;
  employeNom: string;
  motif: string;
  motifDetail: string | null;
  dateDebut: string;
  dateFin: string;
  jours: number;
}): Promise<void> {
  const { managerEmail, employeNom, motif, motifDetail, dateDebut, dateFin, jours } = params;
  const motifFull = motifDetail ? `${motif} (${motifDetail})` : motif;

  const subject = `[SIRH] Demande de congé à valider — ${employeNom}`;

  const textBody =
    `${employeNom} a soumis une demande d'absence qui attend votre avis.\n\n` +
    `Motif : ${motifFull}\n` +
    `Du ${dateDebut} au ${dateFin} (${jours} jour${jours > 1 ? "s" : ""})\n\n` +
    `Donner votre avis : https://${APP_HOST}/validations-conges`;

  const htmlBody = renderNotificationHtml({
    title: "Demande de congé à valider",
    intro: `<strong>${escapeHtml(employeNom)}</strong> a soumis une demande d'absence qui attend votre avis.`,
    sections: [
      {
        label: "Motif",
        html: `<p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">${escapeHtml(motifFull)}</p>`,
      },
      {
        label: "Dates",
        html: `<p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">Du <strong>${escapeHtml(dateDebut)}</strong> au <strong>${escapeHtml(dateFin)}</strong> — ${jours} jour${jours > 1 ? "s" : ""}</p>`,
      },
    ],
    ctaPath: "/validations-conges",
  });

  await sendEmail(subject, textBody, htmlBody, managerEmail);
}

/** Sent to the requester themselves once RH gives the final visa — the
 * "Notification: retour au collaborateur" step of the circuit. */
export async function sendCongeDecisionNotification(params: {
  employeEmail: string;
  employeNom: string;
  motif: string;
  dateDebut: string;
  dateFin: string;
  statut: "validee" | "refusee";
}): Promise<void> {
  const { employeEmail, employeNom, motif, dateDebut, dateFin, statut } = params;
  const decision = statut === "validee" ? "validée" : "refusée";

  const subject = `[SIRH] Votre demande de congé a été ${decision}`;

  const textBody =
    `Votre demande d'absence (${motif}, du ${dateDebut} au ${dateFin}) a été ${decision} par la RH.\n\n` +
    `Voir dans le SIRH : https://${APP_HOST}/mes-conges`;

  const htmlBody = renderNotificationHtml({
    title: `Demande de congé ${decision}`,
    intro: `Bonjour <strong>${escapeHtml(employeNom)}</strong>, votre demande d'absence a été <strong>${decision}</strong> par la RH.`,
    sections: [
      {
        label: "Demande",
        html: `<p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">${escapeHtml(motif)} — du ${escapeHtml(dateDebut)} au ${escapeHtml(dateFin)}</p>`,
      },
    ],
    ctaPath: "/mes-conges",
  });

  await sendEmail(subject, textBody, htmlBody, employeEmail);
}

/** Sent to the requester when their manager asks for the dates to change
 * instead of giving an outright avis — the request stays open (not
 * refused) and the employee can adjust the dates on the same request,
 * which sends it back to the manager for a fresh avis. */
export async function sendCongeChangeRequestedNotification(params: {
  employeEmail: string;
  employeNom: string;
  motif: string;
  dateDebut: string;
  dateFin: string;
  motifChangement: string | null;
}): Promise<void> {
  const { employeEmail, employeNom, motif, dateDebut, dateFin, motifChangement } = params;

  const subject = `[SIRH] Votre manager demande un changement de dates`;

  const textBody =
    `Votre manager demande un changement de dates pour votre demande d'absence (${motif}, du ${dateDebut} au ${dateFin}).\n\n` +
    (motifChangement ? `Motif : ${motifChangement}\n\n` : "") +
    `Modifiez les dates dans le SIRH : https://${APP_HOST}/mes-conges`;

  const htmlBody = renderNotificationHtml({
    title: "Changement de dates demandé",
    intro: `Bonjour <strong>${escapeHtml(employeNom)}</strong>, votre manager demande un changement de dates pour votre demande d'absence.`,
    sections: [
      {
        label: "Demande actuelle",
        html: `<p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">${escapeHtml(motif)} — du ${escapeHtml(dateDebut)} au ${escapeHtml(dateFin)}</p>`,
      },
      ...(motifChangement
        ? [
            {
              label: "Motif du changement",
              html: `<p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">${escapeHtml(motifChangement)}</p>`,
            },
          ]
        : []),
    ],
    ctaPath: "/mes-conges",
  });

  await sendEmail(subject, textBody, htmlBody, employeEmail);
}
