const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const LOGIN_ROOT = "https://login.microsoftonline.com";

export type GraphMessage = {
  id: string;
  internetMessageId: string;
  from: { emailAddress: { address: string; name: string } };
  subject: string;
  bodyPreview: string;
  receivedDateTime: string;
};

export function mailConfigured() {
  return Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_MAILBOX);
}

async function accessToken() {
  const tenant = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const clientSecret = process.env.MS_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) throw new Error("Microsoft Graph credentials are not configured");
  const response = await fetch(`${LOGIN_ROOT}/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Graph token request failed (${response.status})`);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Graph token response did not include an access token");
  return data.access_token;
}

function mailbox() {
  const box = process.env.MS_MAILBOX;
  if (!box) throw new Error("MS_MAILBOX is not configured");
  return box;
}

/** Reads the shared operations mailbox. Requires the Graph application permission Mail.Read. */
export async function listMailboxMessages(limit = 25): Promise<GraphMessage[]> {
  const token = await accessToken();
  const url = `${GRAPH_ROOT}/users/${encodeURIComponent(mailbox())}/messages?$select=id,internetMessageId,from,subject,bodyPreview,receivedDateTime&$orderby=receivedDateTime desc&$top=${limit}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' }, cache: "no-store" });
  if (!response.ok) throw new Error(`Graph message list failed (${response.status})`);
  const data = (await response.json()) as { value?: GraphMessage[] };
  return data.value ?? [];
}

/** Reads the full body of a single message so manifest lines can be parsed from it. */
export async function readMailboxMessage(internetMessageId: string) {
  const token = await accessToken();
  const url = `${GRAPH_ROOT}/users/${encodeURIComponent(mailbox())}/messages/${encodeURIComponent(internetMessageId)}?$select=id,internetMessageId,from,subject,body,receivedDateTime`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`Graph message read failed (${response.status})`);
  const data = (await response.json()) as { body?: { content?: string } };
  return data.body?.content ?? "";
}

/** Sends a message from the operations mailbox. Requires the Graph application permission Mail.Send. */
export async function sendMailboxMessage(input: { to: string; subject: string; body: string; cc?: string[] }) {
  const token = await accessToken();
  const response = await fetch(`${GRAPH_ROOT}/users/${encodeURIComponent(mailbox())}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "HTML", content: input.body },
        toRecipients: [{ emailAddress: { address: input.to } }],
        ...(input.cc?.length ? { ccRecipients: input.cc.map((address) => ({ emailAddress: { address } })) } : {}),
      },
      saveToSentItems: true,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Graph sendMail failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  return { sent: true };
}
