/**
 * One normalised shape for everything we ingest, whatever platform it came
 * from. Adapters read; only Reddit can post, and only as a named human
 * operator who approved the text (see src/lib/operators.ts).
 */

export const PLATFORMS = ["REDDIT", "HACKERNEWS", "PRODUCTHUNT", "GITHUB", "STACKOVERFLOW", "LINKEDIN", "APIFY"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_META: Record<
  Platform,
  {
    label: string;
    short: string;
    /** What the per-platform scope list means in the monitor form. */
    scopeLabel: string;
    scopeHint: string;
    /** Channel name used for policy lookup when the item has no finer channel. */
    defaultChannel: string;
    /** Can the app post here? Only Reddit — everywhere else you reply in the browser. */
    canPost: boolean;
    /** Prefix for Thread.id so ids never collide across platforms. */
    idPrefix: string;
    needsKey: string | null;
  }
> = {
  REDDIT: {
    label: "Reddit",
    short: "reddit",
    scopeLabel: "Subreddits",
    scopeHint: "Leave empty to search all of Reddit (noisier).",
    defaultChannel: "reddit",
    canPost: true,
    idPrefix: "",
    needsKey: "REDDIT_CLIENT_ID",
  },
  HACKERNEWS: {
    label: "Hacker News",
    short: "hn",
    scopeLabel: "HN scope",
    scopeHint: "Leave empty for all of HN. Use 'ask_hn' or 'show_hn' to narrow.",
    defaultChannel: "news.ycombinator.com",
    canPost: false,
    idPrefix: "hn_",
    needsKey: null,
  },
  PRODUCTHUNT: {
    label: "Product Hunt",
    short: "ph",
    scopeLabel: "PH topics",
    scopeHint: "Feed topic slugs, e.g. artificial-intelligence, developer-tools.",
    defaultChannel: "producthunt.com",
    canPost: false,
    idPrefix: "ph_",
    needsKey: null,
  },
  GITHUB: {
    label: "GitHub",
    short: "gh",
    scopeLabel: "Repos",
    scopeHint: "owner/repo per line. Leave empty to search all public issues.",
    defaultChannel: "github.com",
    canPost: false,
    idPrefix: "gh_",
    needsKey: "GITHUB_TOKEN",
  },
  STACKOVERFLOW: {
    label: "Stack Overflow",
    short: "so",
    scopeLabel: "Tags",
    scopeHint: "Tag per line, e.g. langchain, retrieval-augmented-generation.",
    defaultChannel: "stackoverflow.com",
    canPost: false,
    idPrefix: "so_",
    needsKey: null,
  },
  APIFY: {
    label: "Apify",
    short: "apify",
    scopeLabel: "Apify actors",
    scopeHint: "Actor names from the Apify page, one per line. Leave empty to run every active actor.",
    defaultChannel: "web",
    canPost: false,
    idPrefix: "ap_",
    needsKey: "APIFY_TOKEN",
  },
  LINKEDIN: {
    label: "LinkedIn",
    short: "li",
    scopeLabel: "LinkedIn sources",
    scopeHint:
      "Leave empty for everything configured. Use 'api', 'mail' or 'manual' to restrict this monitor to one ingest path.",
    defaultChannel: "linkedin.com",
    canPost: false,
    idPrefix: "li_",
    needsKey: "LINKEDIN_ACCESS_TOKEN",
  },
};

export function isPlatform(v: string): v is Platform {
  return (PLATFORMS as readonly string[]).includes(v);
}

export function platformLabel(v: string | null | undefined): string {
  return v && isPlatform(v) ? PLATFORM_META[v].label : "Reddit";
}

/** A post or comment from any platform, normalised. */
export interface SourceItem {
  id: string; // globally unique, already prefixed
  platform: Platform;
  kind: "POST" | "COMMENT";
  /** Channel used for the policy lookup: subreddit, repo, tag, or the site. */
  channel: string;
  title: string;
  body: string;
  author: string;
  permalink: string; // absolute
  url: string;
  score: number;
  numComments: number;
  createdUtc: Date;
  linkId?: string;
  linkTitle?: string;
  parentId?: string;
}

export interface FetchOptions {
  keywords: string[];
  scope: string[];
  since: Date;
  scanComments: boolean;
  limit?: number;
  /** Set by the poller. Only the Apify adapter needs it — its actors are per-project config. */
  projectId?: string;
}

export interface SourceAdapter {
  platform: Platform;
  fetch(opts: FetchOptions): Promise<SourceItem[]>;
}

/** Parse Monitor.platforms; always yields at least Reddit. */
export function parsePlatforms(raw: string | null | undefined): Platform[] {
  if (!raw) return ["REDDIT"];
  try {
    const v = JSON.parse(raw);
    const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").filter(isPlatform) : [];
    return list.length ? (list as Platform[]) : ["REDDIT"];
  } catch {
    return ["REDDIT"];
  }
}

/** Parse Monitor.sources: {platform: string[]}. */
export function parseSources(raw: string | null | undefined): Partial<Record<Platform, string[]>> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Partial<Record<Platform, string[]>> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (isPlatform(k) && Array.isArray(val)) out[k] = val.filter((x): x is string => typeof x === "string");
    }
    return out;
  } catch {
    return {};
  }
}

const UA = process.env.SONAR_USER_AGENT || "reddit-sonar/1.0 (GTM signal monitor; contact: bd@neoito.com)";

/** Shared JSON fetch with a timeout and a descriptive User-Agent. */
export async function getJson<T>(url: string, headers: Record<string, string> = {}, timeoutMs = 12_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${new URL(url).host}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getText(url: string, headers: Record<string, string> = {}, timeoutMs = 12_000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${new URL(url).host}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Display label for a channel, qualified by platform: "r/LocalLLaMA", "HN", "gh langchain-ai/langchain". */
export function channelLabel(platform: string | null | undefined, channel: string): string {
  const p = platform && isPlatform(platform) ? platform : "REDDIT";
  if (p === "REDDIT") return `r/${channel}`;
  if (p === "HACKERNEWS") return "HN";
  if (p === "PRODUCTHUNT") return channel === "producthunt.com" ? "Product Hunt" : `PH ${channel}`;
  if (p === "GITHUB") return channel === "github.com" ? "GitHub" : channel;
  if (p === "STACKOVERFLOW") return channel === "stackoverflow.com" ? "Stack Overflow" : `SO ${channel}`;
  if (p === "LINKEDIN") return channel === "linkedin.com" ? "LinkedIn" : `LinkedIn · ${channel}`;
  if (p === "APIFY") return channel || "Apify";
  return channel;
}
