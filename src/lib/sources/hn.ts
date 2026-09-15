import { getJson, stripHtml, type FetchOptions, type SourceAdapter, type SourceItem } from "./types";

/**
 * Hacker News via the Algolia search API. Free, no key, no scraping:
 * https://hn.algolia.com/api  — please stay under ~10k requests/hour.
 *
 * Read-only. Replying on HN happens in a browser, as one real account.
 */

interface AlgoliaHit {
  objectID: string;
  title?: string | null;
  story_title?: string | null;
  story_id?: number | null;
  parent_id?: number | null;
  comment_text?: string | null;
  story_text?: string | null;
  url?: string | null;
  author?: string | null;
  points?: number | null;
  num_comments?: number | null;
  created_at_i: number;
  _tags?: string[];
}

const API = "https://hn.algolia.com/api/v1/search_by_date";

function toItem(h: AlgoliaHit): SourceItem {
  const isComment = Boolean(h.comment_text);
  const title = h.title ?? h.story_title ?? "(untitled)";
  return {
    id: `hn_${h.objectID}`,
    platform: "HACKERNEWS",
    kind: isComment ? "COMMENT" : "POST",
    channel: "news.ycombinator.com",
    title,
    body: stripHtml(h.comment_text ?? h.story_text ?? ""),
    author: h.author ?? "unknown",
    permalink: `https://news.ycombinator.com/item?id=${h.objectID}`,
    url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
    score: h.points ?? 0,
    numComments: h.num_comments ?? 0,
    createdUtc: new Date(h.created_at_i * 1000),
    ...(isComment
      ? {
          linkId: h.story_id != null ? String(h.story_id) : undefined,
          linkTitle: h.story_title ?? undefined,
          parentId: h.parent_id != null ? String(h.parent_id) : undefined,
        }
      : {}),
  };
}

export const hnAdapter: SourceAdapter = {
  platform: "HACKERNEWS",
  async fetch({ keywords, scope, since, scanComments, limit = 40 }: FetchOptions): Promise<SourceItem[]> {
    if (keywords.length === 0) return [];
    const sinceSec = Math.floor(since.getTime() / 1000);
    const out = new Map<string, SourceItem>();

    // Algolia ranks a multi-term query loosely, so one request per keyword
    // keeps precision. Cap the fan-out so a 40-keyword monitor stays polite.
    const terms = keywords.slice(0, 12);
    const tagSets = scanComments ? ["story", "comment"] : ["story"];
    const scopeTags = scope
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"))
      .filter((s) => ["ask_hn", "show_hn", "front_page", "poll"].includes(s));

    for (const term of terms) {
      for (const tag of tagSets) {
        const tags = scopeTags.length && tag === "story" ? `(${[tag, ...scopeTags].join(",")})` : tag;
        const params = new URLSearchParams({
          query: term,
          tags,
          numericFilters: `created_at_i>${sinceSec}`,
          hitsPerPage: String(Math.min(limit, 50)),
        });
        const json = await getJson<{ hits: AlgoliaHit[] }>(`${API}?${params}`);
        for (const h of json.hits ?? []) {
          const item = toItem(h);
          if (item.createdUtc < since) continue;
          if (!item.body && !item.title) continue;
          out.set(item.id, item);
        }
      }
    }
    return [...out.values()];
  },
};
