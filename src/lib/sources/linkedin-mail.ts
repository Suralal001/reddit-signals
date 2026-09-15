import { stripHtml, type SourceItem } from "./types";

/**
 * LinkedIn signals out of your own mailbox, via Microsoft Graph.
 *
 * LinkedIn emails you when someone mentions the Page, comments on a post, or
 * when a Sales Navigator alert fires. Reading YOUR OWN inbox is not scraping
 * LinkedIn — no LinkedIn session is touched, no terms are strained, and it
 * picks up Sales Navigator alerts that no API exposes at all.
 *
 * Setup (Microsoft 365, which is what the team already runs):
 *   1. Register an app in Entra ID, add the APPLICATION permission Mail.Read,
 *      and grant admin consent.
 *   2. Scope it to one mailbox with New-ApplicationAccessPolicy so the app can
 *      only ever read that inbox — do not leave it tenant-wide.
 *   3. Point LinkedIn notification emails at that mailbox (a rule, or just
 *      sign the Page up with it).
 *
 *   MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET
 *   LINKEDIN_MAIL_USER    — the mailbox, e.g. signals@getchordian.com
 *   LINKEDIN_MAIL_FOLDER  — optional folder name, defaults to Inbox
 */

const GRAPH = "https://graph.microsoft.com/v1.0";

interface GraphMessage {
  id: string;
  subject?: string | null;
  receivedDateTime?: string;
  bodyPreview?: string | null;
  webLink?: string | null;
  from?: { emailAddress?: { name?: string; address?: string } };
  body?: { contentType?: string; content?: string };
}

let token: { value: string; expiresAt: number } | null = null;

export function linkedInMailConfigured(): boolean {
  return Boolean(
    process.env.MS_GRAPH_TENANT_ID &&
      process.env.MS_GRAPH_CLIENT_ID &&
      process.env.MS_GRAPH_CLIENT_SECRET &&
      process.env.LINKEDIN_MAIL_USER,
  );
}

async function graphToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 30_000) return token.value;
  const tenant = process.env.MS_GRAPH_TENANT_ID!;
  const body = new URLSearchParams({
    client_id: process.env.MS_GRAPH_CLIENT_ID!,
    client_secret: process.env.MS_GRAPH_CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Microsoft Graph token failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Microsoft Graph returned no access token");
  token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return token.value;
}

/** LinkedIn's sending domains. Anything else in the mailbox is ignored. */
const LINKEDIN_SENDERS = /@(.*\.)?(linkedin|e\.linkedin|bounce\.linkedin)\.com$/i;

/** Boilerplate LinkedIn wraps around every notification. */
const FOOTER_CUT =
  /(This email was intended for|You are receiving \w+ emails|Unsubscribe|Help\s*\|\s*Unsubscribe|©\s*\d{4}\s*LinkedIn)/i;

const LI_URL = /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/[^\s"'<>)]+/gi;

/** Strip LinkedIn's tracking wrapper so the same post doesn't look like two. */
function cleanUrl(u: string): string {
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) {
      if (/^(trk|trkEmail|midToken|midSig|eid|otpToken|lipi|licu|lici|utm_.*)$/i.test(k)) url.searchParams.delete(k);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

function classify(subject: string): { title: string; kind: "POST" | "COMMENT"; channel: string } {
  const s = subject.toLowerCase();
  if (/\bcommented\b|\breplied\b|\bcomment on\b/.test(s))
    return { title: subject, kind: "COMMENT", channel: "linkedin.com" };
  if (/\bmentioned\b|\btagged\b/.test(s)) return { title: subject, kind: "POST", channel: "linkedin.com" };
  if (/sales navigator|buyer intent|alert|is hiring|changed jobs|new role|viewed your/.test(s))
    return { title: subject, kind: "POST", channel: "sales-navigator" };
  return { title: subject, kind: "POST", channel: "linkedin.com" };
}

export async function fetchLinkedInMail(since: Date): Promise<SourceItem[]> {
  if (!linkedInMailConfigured()) return [];
  const user = encodeURIComponent(process.env.LINKEDIN_MAIL_USER!);
  const folder = process.env.LINKEDIN_MAIL_FOLDER || "Inbox";
  const path =
    folder.toLowerCase() === "inbox"
      ? `/users/${user}/mailFolders/inbox/messages`
      : `/users/${user}/mailFolders/${encodeURIComponent(folder)}/messages`;

  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${since.toISOString()}`,
    $select: "id,subject,receivedDateTime,bodyPreview,webLink,from,body",
    $orderby: "receivedDateTime desc",
    $top: "50",
  });

  const res = await fetch(`${GRAPH}${path}?${params}`, {
    headers: { Authorization: `Bearer ${await graphToken()}`, Prefer: 'outlook.body-content-type="text"' },
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    if (res.status === 403) {
      throw new Error(
        `Microsoft Graph 403 reading ${process.env.LINKEDIN_MAIL_USER}. The app needs the Mail.Read APPLICATION permission with admin consent, and an ApplicationAccessPolicy that includes this mailbox. (${body})`,
      );
    }
    throw new Error(`Microsoft Graph ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { value?: GraphMessage[] };

  const out: SourceItem[] = [];
  for (const m of json.value ?? []) {
    const from = m.from?.emailAddress?.address ?? "";
    if (!LINKEDIN_SENDERS.test(from)) continue;
    const when = m.receivedDateTime ? new Date(m.receivedDateTime) : new Date();
    if (when < since) continue;

    const subject = (m.subject ?? "").trim() || "LinkedIn notification";
    const raw = m.body?.contentType === "html" ? stripHtml(m.body?.content ?? "") : (m.body?.content ?? m.bodyPreview ?? "");
    const cut = raw.split(FOOTER_CUT)[0].trim();
    const links = [...new Set([...(raw.match(LI_URL) ?? [])].map(cleanUrl))]
      .filter((u) => !/\/(unsubscribe|comm\/psettings|help)/i.test(u))
      .slice(0, 3);

    const { title, kind, channel } = classify(subject);
    const permalink = links[0] ?? m.webLink ?? "https://www.linkedin.com/feed/";
    const body = [cut, links.length > 1 ? `\nLinks: ${links.join(" ")}` : ""].join("").trim();
    if (!body) continue;

    out.push({
      id: `li_mail_${m.id.replace(/[^\w-]/g, "").slice(-48)}`,
      platform: "LINKEDIN",
      kind,
      channel,
      title,
      body: body.slice(0, 6000),
      author: m.from?.emailAddress?.name ?? "LinkedIn",
      permalink,
      url: permalink,
      score: 0,
      numComments: 0,
      createdUtc: when,
    });
  }
  return out;
}
