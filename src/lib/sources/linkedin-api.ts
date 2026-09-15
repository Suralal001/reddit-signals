import { stripHtml, type SourceItem } from "./types";

/**
 * LinkedIn via the official Community Management API.
 *
 * Read this before wiring it up, because LinkedIn is not like the other
 * sources: there is NO keyword search across public LinkedIn content. LinkedIn
 * exposes no "search by keyword in UGC" endpoint, and no sanctioned way to
 * sweep the network for people discussing agent memory. What the API does give
 * you, as a Page admin, is everything that touches your own org:
 *
 *   - posts that @mention the company Page          (SHARE_MENTION)
 *   - comments on the Page's own posts              (COMMENT, ADMIN_COMMENT)
 *
 * That second one is where the buying signals actually live once the founders
 * are posting: the questions underneath their content.
 *
 * Everything here is read-only. Replying on LinkedIn happens in the browser,
 * as the person whose name is on the comment.
 *
 * Setup: a LinkedIn developer app with Community Management API access, then a
 * member access token from someone who administers the Page.
 *   LINKEDIN_ACCESS_TOKEN  — member token with rw_organization_admin
 *   LINKEDIN_ORG_ID        — numeric org id (from the Page admin URL)
 *   LINKEDIN_API_VERSION   — optional, YYYYMM; defaults below
 */

const API = "https://api.linkedin.com/rest";
const DEFAULT_VERSION = "202608";

// Notifications are retained for 60 days; we never ask for more than that.
const MAX_LOOKBACK_MS = 60 * 86_400_000;

interface Notification {
  notificationId?: number;
  action?: string;
  sourcePost?: string;
  generatedActivity?: string;
  lastModifiedAt?: number;
}

interface CommentEl {
  actor?: string;
  id?: string;
  commentUrn?: string;
  object?: string;
  created?: { time?: number };
  message?: { text?: string };
}

export function linkedInConfigured(): boolean {
  return Boolean(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ORG_ID);
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": process.env.LINKEDIN_API_VERSION || DEFAULT_VERSION,
  };
}

async function li<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `LinkedIn ${res.status}: the access token is expired or lacks rw_organization_admin. LinkedIn member tokens last 60 days — refresh it and update LINKEDIN_ACCESS_TOKEN. (${body.slice(0, 200)})`,
      );
    }
    throw new Error(`LinkedIn API ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** urn:li:activity:123 → the public feed permalink. */
function feedUrl(activityUrn: string, commentUrn?: string): string {
  const base = `https://www.linkedin.com/feed/update/${activityUrn}/`;
  return commentUrn ? `${base}?commentUrn=${encodeURIComponent(commentUrn)}` : base;
}

/** urn:li:person:AbC123 → AbC123. Names need a permission we don't ask for. */
function actorLabel(urn: string | undefined): string {
  if (!urn) return "LinkedIn member";
  const id = urn.split(":").pop() ?? urn;
  if (urn.includes(":organization:")) return `organization ${id}`;
  return id;
}

async function fetchComments(sourcePost: string): Promise<Map<string, CommentEl>> {
  const enc = encodeURIComponent(sourcePost);
  const json = await li<{ elements?: CommentEl[] }>(`/socialActions/${enc}/comments`);
  const byId = new Map<string, CommentEl>();
  for (const c of json.elements ?? []) {
    if (c.id) byId.set(String(c.id), c);
    if (c.commentUrn) byId.set(c.commentUrn, c);
  }
  return byId;
}

async function fetchPostCommentary(shareUrn: string): Promise<{ text: string; author: string } | null> {
  try {
    const enc = encodeURIComponent(shareUrn);
    const json = await li<{ commentary?: string; author?: string }>(`/posts/${enc}`);
    return { text: stripHtml(json.commentary ?? ""), author: actorLabel(json.author) };
  } catch {
    // A mention on a post we can't read (private page, deleted) is still worth
    // surfacing as a bare link rather than dropping silently.
    return null;
  }
}

export async function fetchLinkedInApi(since: Date): Promise<SourceItem[]> {
  if (!linkedInConfigured()) return [];
  const orgUrn = `urn:li:organization:${process.env.LINKEDIN_ORG_ID}`;
  const start = Math.max(since.getTime(), Date.now() - MAX_LOOKBACK_MS);

  const params = new URLSearchParams({ q: "criteria" });
  const qs =
    `?${params}` +
    `&actions=${encodeURIComponent("List(COMMENT,ADMIN_COMMENT,SHARE_MENTION)")}` +
    `&organizationalEntity=${encodeURIComponent(orgUrn)}` +
    `&timeRange.start=${start}&timeRange.end=${Date.now()}`;

  const json = await li<{ elements?: Notification[] }>(`/organizationalEntityNotifications${qs}`);
  const notifications = json.elements ?? [];
  if (notifications.length === 0) return [];

  // One comments call per source post, not one per notification.
  const commentPosts = [
    ...new Set(
      notifications
        .filter((n) => n.action === "COMMENT" || n.action === "ADMIN_COMMENT")
        .map((n) => n.sourcePost)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const commentsByPost = new Map<string, Map<string, CommentEl>>();
  for (const p of commentPosts.slice(0, 25)) {
    try {
      commentsByPost.set(p, await fetchComments(p));
    } catch {
      // Keep going: one unreadable post shouldn't lose the rest of the batch.
    }
  }

  const out: SourceItem[] = [];
  for (const n of notifications) {
    const when = new Date(n.lastModifiedAt ?? Date.now());
    if (when < since) continue;
    const sourcePost = n.sourcePost ?? "";
    const gen = n.generatedActivity ?? "";

    if (n.action === "COMMENT" || n.action === "ADMIN_COMMENT") {
      const idPart = gen.includes(",") ? gen.replace(/\)$/, "").split(",").pop()! : gen;
      const c = commentsByPost.get(sourcePost)?.get(idPart) ?? commentsByPost.get(sourcePost)?.get(gen);
      const text = c?.message?.text ?? "";
      if (!text) continue;
      out.push({
        id: `li_${(gen || `${sourcePost}-${n.notificationId}`).replace(/[^\w-]/g, "_")}`,
        platform: "LINKEDIN",
        kind: "COMMENT",
        channel: "linkedin.com",
        title: "Comment on a company post",
        body: text,
        author: actorLabel(c?.actor),
        permalink: feedUrl(sourcePost, gen),
        url: feedUrl(sourcePost, gen),
        score: 0,
        numComments: 0,
        createdUtc: c?.created?.time ? new Date(c.created.time) : when,
        linkId: sourcePost,
        linkTitle: "Our post",
        parentId: sourcePost,
      });
      continue;
    }

    if (n.action === "SHARE_MENTION") {
      const post = gen ? await fetchPostCommentary(gen) : null;
      out.push({
        id: `li_${(gen || String(n.notificationId)).replace(/[^\w-]/g, "_")}`,
        platform: "LINKEDIN",
        kind: "POST",
        channel: "linkedin.com",
        title: "Someone mentioned the company Page",
        body: post?.text || "(post text unavailable — open it on LinkedIn)",
        author: post?.author ?? "LinkedIn member",
        permalink: feedUrl(gen || sourcePost),
        url: feedUrl(gen || sourcePost),
        score: 0,
        numComments: 0,
        createdUtc: when,
      });
    }
  }
  return out;
}
