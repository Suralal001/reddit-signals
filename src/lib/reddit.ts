import { isMock } from "./util";
import { mockSearch, mockNewComments, mockCommentStats, mockPostComment, mockMe } from "./reddit-mock";

/**
 * Minimal Reddit API client for a "script" app (OAuth2 password grant).
 *
 * Everything — reading and posting — happens as the account in .env, via the
 * official API, with a descriptive User-Agent. No browser automation, no
 * detection evasion: this is the sanctioned way to build on Reddit and it
 * keeps the account in good standing.
 *
 * Docs: https://github.com/reddit-archive/reddit/wiki/OAuth2
 */

export interface RedditPost {
  id: string; // without the t3_ prefix
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  permalink: string; // relative, e.g. /r/foo/comments/abc/...
  url: string;
  score: number;
  numComments: number;
  createdUtc: number; // seconds
}

export interface RedditComment {
  id: string; // bare comment id (no t1_)
  subreddit: string;
  body: string;
  author: string;
  permalink: string;
  linkId: string; // bare parent post id
  linkTitle: string;
  parentId: string; // fullname of immediate parent (t1_ or t3_)
  score: number;
  createdUtc: number; // seconds
}

export interface CommentStats {
  score: number;
  replyCount: number;
  removed: boolean;
}

export type TimeWindow = "hour" | "day" | "week" | "month" | "year" | "all";

export interface SearchOptions {
  keywords: string[];
  subreddits: string[]; // empty = all of Reddit
  limit?: number;
  time?: TimeWindow;
}

export interface RedditClient {
  search(opts: SearchOptions): Promise<RedditPost[]>;
  /** Newest comments across the given subreddits (one call, up to 100). */
  newComments(subreddits: string[], limit?: number): Promise<RedditComment[]>;
  /** Score / reply count / removal state of one comment we posted. */
  commentStats(linkId: string, commentId: string): Promise<CommentStats>;
  /** Reply to a post (t3_…) or a comment (t1_…). `parentFullname` must include the prefix. */
  postComment(parentFullname: string, text: string): Promise<{ id: string; permalink: string }>;
  me(): Promise<{ name: string; linkKarma: number; commentKarma: number }>;
}

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API = "https://oauth.reddit.com";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in environment (see .env.example)`);
  return v;
}

/**
 * Credentials for one Reddit account. Each named operator supplies their own
 * script-app credentials through the environment; nothing is ever stored in
 * the database and nobody but the account owner types them.
 */
export interface RedditCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent: string;
  /** Cache key — the operator envKey, or "default". */
  label: string;
}

export function defaultCredentials(): RedditCredentials {
  return {
    clientId: env("REDDIT_CLIENT_ID"),
    clientSecret: env("REDDIT_CLIENT_SECRET"),
    username: env("REDDIT_USERNAME"),
    password: env("REDDIT_PASSWORD"),
    userAgent: env("REDDIT_USER_AGENT"),
    label: "default",
  };
}

/**
 * Credentials for a named operator, read from REDDIT_OP_<KEY>_* variables.
 * Returns null when they aren't configured, so the caller can say so plainly
 * instead of silently posting from the wrong account.
 */
export function operatorCredentials(envKey: string): RedditCredentials | null {
  const k = envKey.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (!k) return null;
  const clientId = process.env[`REDDIT_OP_${k}_CLIENT_ID`];
  const clientSecret = process.env[`REDDIT_OP_${k}_CLIENT_SECRET`];
  const username = process.env[`REDDIT_OP_${k}_USERNAME`];
  const password = process.env[`REDDIT_OP_${k}_PASSWORD`];
  if (!clientId || !clientSecret || !username || !password) return null;
  return {
    clientId,
    clientSecret,
    username,
    password,
    userAgent: process.env[`REDDIT_OP_${k}_USER_AGENT`] || process.env.REDDIT_USER_AGENT || `reddit-sonar/1.0 (operator ${username})`,
    label: k,
  };
}

const tokenCache = new Map<string, { value: string; expiresAt: number }>();

async function getToken(creds: RedditCredentials): Promise<string> {
  const hit = tokenCache.get(creds.label);
  if (hit && hit.expiresAt > Date.now() + 30_000) return hit.value;

  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "password",
    username: creds.username,
    password: creds.password,
    scope: "read submit identity",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "User-Agent": creds.userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`Reddit token request failed for ${creds.username}: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!json.access_token) throw new Error(`Reddit token error for ${creds.username}: ${json.error ?? "unknown"}`);
  const entry = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  tokenCache.set(creds.label, entry);
  return entry.value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiWith<T>(creds: RedditCredentials, path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const token = await getToken(creds);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "User-Agent": creds.userAgent,
    },
  });

  // Be a good citizen: honour Reddit's rate-limit headers (100 req/min).
  const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "10");
  const reset = Number(res.headers.get("x-ratelimit-reset") ?? "0");
  if (res.status === 429 || (remaining < 1 && reset > 0)) {
    if (attempt >= 2) throw new Error("Reddit rate limit exceeded; giving up");
    await sleep((reset || 5) * 1000 + 250);
    return apiWith<T>(creds, path, init, attempt + 1);
  }
  if (!res.ok) throw new Error(`Reddit API ${res.status} on ${path}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Reddit's listing envelope. Every read endpoint returns one of these. */
interface Thing {
  kind: string; // t1 = comment, t3 = post, "more" = collapsed replies
  data: Record<string, unknown>;
}
interface Listing {
  kind: string;
  data: { after?: string | null; before?: string | null; children: Thing[] };
}

function toPost(d: Record<string, unknown>): RedditPost {
  return {
    id: String(d.id ?? ""),
    subreddit: String(d.subreddit ?? ""),
    title: String(d.title ?? ""),
    selftext: String(d.selftext ?? ""),
    author: String(d.author ?? "[deleted]"),
    permalink: String(d.permalink ?? ""),
    url: String(d.url ?? ""),
    score: Number(d.score ?? 0),
    numComments: Number(d.num_comments ?? 0),
    createdUtc: Number(d.created_utc ?? 0),
  };
}

function toComment(d: Record<string, unknown>): RedditComment {
  const linkId = String(d.link_id ?? "").replace(/^t3_/, "");
  const id = String(d.id ?? "");
  return {
    id,
    subreddit: String(d.subreddit ?? ""),
    body: String(d.body ?? ""),
    author: String(d.author ?? "[deleted]"),
    permalink: String(d.permalink ?? (linkId ? `/comments/${linkId}/_/${id}` : "")),
    linkId,
    linkTitle: String(d.link_title ?? ""),
    parentId: String(d.parent_id ?? ""),
    score: Number(d.score ?? 0),
    createdUtc: Number(d.created_utc ?? 0),
  };
}

/**
 * Reddit's search takes one `q` and caps it at 512 characters, so a monitor
 * with a dozen phrases becomes several OR-joined queries rather than one that
 * silently truncates. Multi-word phrases are quoted — unquoted, Reddit matches
 * the words separately and a monitor for "white cast" returns every thread
 * containing "cast".
 */
const MAX_QUERY_CHARS = 480;

export function buildQuery(keywords: string[]): string[] {
  const terms = keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => (/\s/.test(k) ? `"${k.replace(/"/g, "")}"` : k));

  const queries: string[] = [];
  let current: string[] = [];
  for (const t of terms) {
    const candidate = current.length ? `${current.join(" OR ")} OR ${t}` : t;
    if (candidate.length > MAX_QUERY_CHARS && current.length) {
      queries.push(current.join(" OR "));
      current = [t];
    } else {
      current.push(t);
    }
  }
  if (current.length) queries.push(current.join(" OR "));
  return queries;
}

export function makeRedditClient(creds: RedditCredentials): RedditClient {
  const api = <T,>(path: string, init: RequestInit = {}) => apiWith<T>(creds, path, init);
  return {
  async search({ keywords, subreddits, limit = 100, time = "week" }) {
    const subPath = subreddits.length ? `/r/${subreddits.join("+")}` : "";
    const seen = new Map<string, RedditPost>();

    if (keywords.length === 0) {
      // No keywords: just watch the subreddits' new posts.
      if (!subPath) return [];
      const listing = await api<Listing>(`${subPath}/new?limit=${limit}&raw_json=1`);
      for (const c of listing.data.children) if (c.kind === "t3") seen.set(String(c.data.id), toPost(c.data));
      return [...seen.values()];
    }

    for (const q of buildQuery(keywords)) {
      const params = new URLSearchParams({
        q,
        sort: "new",
        t: time,
        limit: String(limit),
        raw_json: "1",
        type: "link",
        ...(subPath ? { restrict_sr: "1" } : {}),
      });
      const listing = await api<Listing>(`${subPath}/search?${params}`);
      for (const c of listing.data.children) if (c.kind === "t3") seen.set(String(c.data.id), toPost(c.data));
    }
    return [...seen.values()];
  },

  async newComments(subreddits, limit = 100) {
    if (subreddits.length === 0) return []; // no site-wide comment firehose worth reading
    const listing = await api<Listing>(`/r/${subreddits.join("+")}/comments?limit=${limit}&raw_json=1`);
    return listing.data.children.filter((c) => c.kind === "t1").map((c) => toComment(c.data));
  },

  async commentStats(linkId, commentId) {
    // /comments/{post}/_/{comment} returns [post listing, comment listing]; depth=1 gives direct replies.
    const res = await api<Listing[]>(`/comments/${linkId}/_/${commentId}?depth=1&limit=100&raw_json=1`);
    const node = res[1]?.data?.children?.[0];
    if (!node || node.kind !== "t1") throw new Error("Comment not found (deleted?)");
    const d = node.data;
    const replies = d.replies as { data?: { children?: { kind: string; data: Record<string, unknown> }[] } } | "" | undefined;
    let replyCount = 0;
    for (const c of replies && typeof replies === "object" ? (replies.data?.children ?? []) : []) {
      replyCount += c.kind === "more" ? Number(c.data.count ?? 0) : 1;
    }
    const body = String(d.body ?? "");
    return {
      score: Number(d.score ?? 0),
      replyCount,
      removed: body === "[removed]" || d.removal_reason != null || Boolean(d.spam),
    };
  },

  async postComment(parentFullname, text) {
    const body = new URLSearchParams({ api_type: "json", thing_id: parentFullname, text });
    const res = await api<{
      json: { errors: string[][]; data?: { things?: { data: Record<string, unknown> }[] } };
    }>(`/api/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (res.json.errors?.length) {
      throw new Error(res.json.errors.map((e) => e.slice(0, 2).join(": ")).join("; "));
    }
    const d = res.json.data?.things?.[0]?.data ?? {};
    return { id: String(d.id ?? ""), permalink: String(d.permalink ?? "") };
  },

  async me() {
    const d = await api<Record<string, unknown>>(`/api/v1/me`);
    return {
      name: String(d.name),
      linkKarma: Number(d.link_karma ?? 0),
      commentKarma: Number(d.comment_karma ?? 0),
    };
  },
  };
}

const mockClient: RedditClient = {
  search: mockSearch,
  newComments: mockNewComments,
  commentStats: mockCommentStats,
  postComment: mockPostComment,
  me: mockMe,
};

export function getRedditClient(): RedditClient {
  return isMock("REDDIT") ? mockClient : makeRedditClient(defaultCredentials());
}

/**
 * A client bound to one named operator's own account. Throws with a clear
 * message when their credentials aren't in the environment — better than
 * quietly posting from the shared account and putting a comment in the wrong
 * person's name.
 */
export function getRedditClientForOperator(op: { name: string; handle: string; envKey: string }): RedditClient {
  if (isMock("REDDIT")) return mockClient;
  const creds = operatorCredentials(op.envKey);
  if (!creds) {
    throw new Error(
      `No credentials configured for ${op.name} (u/${op.handle}). Add REDDIT_OP_${(op.envKey || "KEY").toUpperCase()}_CLIENT_ID / _CLIENT_SECRET / _USERNAME / _PASSWORD to .env — only ${op.name} should ever type those.`,
    );
  }
  return makeRedditClient(creds);
}
