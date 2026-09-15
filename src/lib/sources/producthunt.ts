import { getText, stripHtml, type FetchOptions, type SourceAdapter, type SourceItem } from "./types";

/**
 * Product Hunt via the public RSS feed. No key, no scraping of the app itself.
 * The feed has no search, so we pull recent launches per topic and keyword-
 * match locally — which is what we want anyway: launches in our category are
 * competitor intelligence, and "who launched a memory layer this week" is a
 * signal on its own.
 *
 * Read-only. Comments on Product Hunt are posted by a real maker account.
 */

const FEED = "https://www.producthunt.com/feed";

interface FeedEntry {
  id: string;
  title: string;
  body: string;
  author: string;
  link: string;
  published: Date;
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return stripHtml(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

function parseFeed(xml: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  // Handles both Atom <entry> and RSS <item>.
  const blocks = xml.match(/<(entry|item)\b[\s\S]*?<\/(entry|item)>/gi) ?? [];
  for (const b of blocks) {
    const linkMatch = b.match(/<link[^>]*href="([^"]+)"/i);
    const link = linkMatch ? linkMatch[1] : pick(b, "link");
    const published = pick(b, "published") || pick(b, "updated") || pick(b, "pubDate");
    const id = pick(b, "id") || link;
    if (!id) continue;
    out.push({
      id: id.replace(/[^A-Za-z0-9_-]+/g, "_").slice(-60),
      title: pick(b, "title"),
      body: pick(b, "content") || pick(b, "summary") || pick(b, "description"),
      author: pick(b, "name") || pick(b, "dc:creator") || "producthunt",
      link,
      published: published ? new Date(published) : new Date(),
    });
  }
  return out;
}

export const productHuntAdapter: SourceAdapter = {
  platform: "PRODUCTHUNT",
  async fetch({ keywords, scope, since }: FetchOptions): Promise<SourceItem[]> {
    const topics = scope.length ? scope : [""];
    const out = new Map<string, SourceItem>();
    const hay = keywords.map((k) => k.toLowerCase());

    for (const topic of topics.slice(0, 6)) {
      const url = topic ? `${FEED}?category=${encodeURIComponent(topic)}` : FEED;
      const xml = await getText(url, { Accept: "application/atom+xml, application/rss+xml, text/xml" });
      for (const e of parseFeed(xml)) {
        if (e.published < since) continue;
        const text = `${e.title}\n${e.body}`.toLowerCase();
        // No keywords = take the whole topic feed (category watch).
        if (hay.length && !hay.some((k) => text.includes(k))) continue;
        const id = `ph_${e.id}`;
        out.set(id, {
          id,
          platform: "PRODUCTHUNT",
          kind: "POST",
          channel: topic || "producthunt.com",
          title: e.title,
          body: e.body,
          author: e.author,
          permalink: e.link,
          url: e.link,
          score: 0,
          numComments: 0,
          createdUtc: e.published,
        });
      }
    }
    return [...out.values()];
  },
};
