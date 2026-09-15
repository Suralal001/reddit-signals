import { getRedditClient } from "../reddit";
import { matchKeywords } from "../util";
import { hnAdapter } from "./hn";
import { githubAdapter } from "./github";
import { productHuntAdapter } from "./producthunt";
import { stackOverflowAdapter } from "./stackoverflow";
import { mockFetch } from "./mock";
import { fetchLinkedInApi, linkedInConfigured } from "./linkedin-api";
import { fetchLinkedInMail, linkedInMailConfigured } from "./linkedin-mail";
import { apifyConfigured, fetchApify } from "./apify";
import { PLATFORM_META, type FetchOptions, type Platform, type SourceAdapter, type SourceItem } from "./types";

export * from "./types";

/** Reddit, wrapped in the same shape as every other source. */
const redditAdapter: SourceAdapter = {
  platform: "REDDIT",
  async fetch({ keywords, scope, since, scanComments }: FetchOptions): Promise<SourceItem[]> {
    const reddit = getRedditClient();
    const days = Math.max(1, Math.ceil((Date.now() - since.getTime()) / 86_400_000));
    const out: SourceItem[] = [];

    const posts = await reddit.search({
      keywords,
      subreddits: scope,
      time: days <= 1 ? "day" : days <= 7 ? "week" : "month",
    });
    for (const p of posts) {
      const created = new Date(p.createdUtc * 1000);
      if (created < since) continue;
      out.push({
        id: p.id,
        platform: "REDDIT",
        kind: "POST",
        channel: p.subreddit,
        title: p.title,
        body: p.selftext,
        author: p.author,
        permalink: p.permalink,
        url: p.url,
        score: p.score,
        numComments: p.numComments,
        createdUtc: created,
      });
    }

    // Reddit search is post-only; comments come from the subreddits' newest
    // comments and are keyword-matched locally.
    if (scanComments && scope.length && keywords.length) {
      const comments = await reddit.newComments(scope);
      for (const c of comments) {
        const created = new Date(c.createdUtc * 1000);
        if (created < since) continue;
        if (matchKeywords(`${c.linkTitle}\n${c.body}`, keywords).length === 0) continue;
        out.push({
          id: `t1_${c.id}`,
          platform: "REDDIT",
          kind: "COMMENT",
          channel: c.subreddit,
          title: c.linkTitle,
          body: c.body,
          author: c.author,
          permalink: c.permalink,
          url: `https://www.reddit.com${c.permalink}`,
          score: c.score,
          numComments: 0,
          createdUtc: created,
          linkId: c.linkId,
          linkTitle: c.linkTitle,
          parentId: c.parentId,
        });
      }
    }
    return out;
  },
};

/**
 * LinkedIn has no keyword search, so this adapter doesn't take one. It merges
 * whatever ingest paths are configured: the Community Management API (Page
 * mentions and comments on our own posts) and the mailbox reader (LinkedIn
 * notification and Sales Navigator alert emails). Items pasted in by hand
 * arrive through addManualSignal instead and never touch this code.
 */
const linkedInAdapter: SourceAdapter = {
  platform: "LINKEDIN",
  async fetch({ scope, since }: FetchOptions): Promise<SourceItem[]> {
    const want = (mode: string) => scope.length === 0 || scope.some((s) => s.trim().toLowerCase() === mode);
    const out = new Map<string, SourceItem>();
    const errors: string[] = [];

    if (want("api") && linkedInConfigured()) {
      try {
        for (const i of await fetchLinkedInApi(since)) out.set(i.id, i);
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    if (want("mail") && linkedInMailConfigured()) {
      try {
        for (const i of await fetchLinkedInMail(since)) out.set(i.id, i);
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    // Only fail loudly if every configured path failed; a working mailbox
    // shouldn't be hidden by an expired API token.
    if (out.size === 0 && errors.length) throw new Error(errors.join(" · "));
    return [...out.values()];
  },
};

/**
 * Apify actors are per-project configuration rather than code, so this adapter
 * needs the project id and reads its own definitions. Cadence and daily run
 * caps are checked inside fetchApify — actors bill per run.
 */
const apifyAdapter: SourceAdapter = {
  platform: "APIFY",
  async fetch({ keywords, scope, since, projectId }: FetchOptions): Promise<SourceItem[]> {
    if (!projectId) return [];
    return fetchApify(projectId, scope, keywords, since);
  },
};

const ADAPTERS: Record<Platform, SourceAdapter> = {
  REDDIT: redditAdapter,
  HACKERNEWS: hnAdapter,
  PRODUCTHUNT: productHuntAdapter,
  GITHUB: githubAdapter,
  STACKOVERFLOW: stackOverflowAdapter,
  LINKEDIN: linkedInAdapter,
  APIFY: apifyAdapter,
};

function mockSourcesOn(): boolean {
  const v = process.env.MOCK_SOURCES;
  return v === "1" || v === "true";
}

/**
 * Fetch from one platform. Reddit keeps its own MOCK_REDDIT switch (it has a
 * full fixture set); the other sources share MOCK_SOURCES.
 */
export async function fetchFrom(platform: Platform, opts: FetchOptions): Promise<SourceItem[]> {
  // Apify is deliberately never mocked: a fake run would hide a broken actor
  // config until the day it costs money to find out.
  if (platform !== "REDDIT" && platform !== "APIFY" && mockSourcesOn()) return mockFetch(platform, opts);
  const adapter = ADAPTERS[platform];
  if (!adapter) throw new Error(`Unknown platform ${platform}`);
  return adapter.fetch(opts);
}

/** Is this platform usable right now, or is a key missing? */
export function platformReady(platform: Platform): { ok: boolean; reason?: string } {
  if (platform !== "REDDIT" && mockSourcesOn()) return { ok: true };
  const meta = PLATFORM_META[platform];
  if (platform === "REDDIT") {
    const mock = process.env.MOCK_REDDIT === "1" || process.env.MOCK_REDDIT === "true";
    if (mock) return { ok: true };
    return process.env.REDDIT_CLIENT_ID
      ? { ok: true }
      : { ok: false, reason: "Reddit credentials missing in .env (REDDIT_CLIENT_ID)." };
  }
  if (platform === "APIFY") {
    return apifyConfigured()
      ? { ok: true }
      : { ok: false, reason: "APIFY_TOKEN is not set in .env — add it, then configure actors on the Apify page." };
  }
  if (platform === "LINKEDIN") {
    if (linkedInConfigured() || linkedInMailConfigured()) return { ok: true };
    return {
      ok: false,
      reason:
        "LinkedIn has no ingest path configured. Set up the Community Management API (LINKEDIN_ACCESS_TOKEN + LINKEDIN_ORG_ID) or the mailbox reader (MS_GRAPH_* + LINKEDIN_MAIL_USER). Pasted signals work without either.",
    };
  }
  if (meta.needsKey && !process.env[meta.needsKey]) {
    // Optional keys only raise the rate limit; the source still works without.
    return { ok: true, reason: `${meta.needsKey} not set — running at the unauthenticated rate limit.` };
  }
  return { ok: true };
}
