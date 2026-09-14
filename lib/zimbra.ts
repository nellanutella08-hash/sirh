import "server-only";

const HOST = process.env.ZIMBRA_HOST;
const USER = process.env.ZIMBRA_USER;
const PASS = process.env.ZIMBRA_PASS;

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

/** Best-effort notification email via the RH team's own Zimbra mailbox
 * (zimbra.smile.ci) — never throws, so an email outage can't break the
 * action that triggered it (e.g. a collaborateur submitting a request). */
export async function sendNotificationEmail(subject: string, bodyText: string): Promise<void> {
  if (!ZIMBRA_NOTIFICATIONS_ENABLED) return;
  try {
    const token = await zimbraAuthToken();
    await soapPost({
      Header: { context: { _jsns: "urn:zimbra", authToken: token } },
      Body: {
        SendMsgRequest: {
          _jsns: "urn:zimbraMail",
          m: {
            e: [{ t: "t", a: USER }],
            su: { _content: subject },
            mp: [{ ct: "text/plain", content: { _content: bodyText } }],
          },
        },
      },
    });
  } catch (err) {
    console.error("[zimbra] échec d'envoi de la notification", err);
  }
}
