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

const APP_URL = `https://${
  process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "sirh-nine.vercel.app"
}/documents`;

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendEmail(subject: string, textBody: string, htmlBody: string): Promise<void> {
  if (!ZIMBRA_NOTIFICATIONS_ENABLED) return;
  try {
    const token = await zimbraAuthToken();
    await soapPost({
      Header: { context: { _jsns: "urn:zimbra", authToken: token } },
      Body: {
        SendMsgRequest: {
          _jsns: "urn:zimbraMail",
          m: {
            e: [
              { t: "f", a: USER, p: FROM_DISPLAY_NAME },
              { t: "t", a: NOTIFY_TO },
            ],
            su: { _content: subject },
            mp: {
              ct: "multipart/alternative",
              mp: [
                { ct: "text/plain", content: { _content: textBody } },
                { ct: "text/html", content: { _content: htmlBody } },
              ],
            },
          },
        },
      },
    });
  } catch (err) {
    console.error("[zimbra] échec d'envoi de la notification", err);
  }
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
  const docList = typeDocuments.join(", ");

  const subject = `[SIRH] Nouvelle demande de document — ${employeNom}`;

  const textBody =
    `${employeNom} vient de soumettre une demande de document via le SIRH.\n\n` +
    `Document(s) demandé(s) : ${docList}\n` +
    `Motif : ${motif}\n\n` +
    `Voir dans le SIRH : ${APP_URL}`;

  const htmlBody = `
<div style="font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;">
  <div style="background:#4b2882;padding:16px 24px;border-radius:10px 10px 0 0;">
    <div style="color:#ffffff;font-size:15px;font-weight:600;">Nouvelle demande de document</div>
  </div>
  <div style="border:1px solid #eeecf5;border-top:none;border-radius:0 0 10px 10px;padding:22px 24px;background:#ffffff;">
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#1c1c2e;">
      <strong>${escapeHtml(employeNom)}</strong> vient de soumettre une demande de document via le SIRH.
    </p>
    <div style="margin:0 0 14px;">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#9a90a8;margin-bottom:6px;">
        Document(s) demandé(s)
      </div>
      <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6;color:#1c1c2e;">
        ${typeDocuments.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}
      </ul>
    </div>
    <div style="margin:0 0 18px;">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#9a90a8;margin-bottom:6px;">
        Motif
      </div>
      <p style="margin:0;font-size:14px;line-height:1.5;color:#1c1c2e;">${escapeHtml(motif)}</p>
    </div>
    <a href="${APP_URL}" style="display:inline-block;background:#4b2882;color:#ffffff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:500;">
      Voir dans le SIRH
    </a>
  </div>
</div>`;

  await sendEmail(subject, textBody, htmlBody);
}
