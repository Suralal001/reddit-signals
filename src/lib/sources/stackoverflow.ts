import { getJson, stripHtml, type FetchOptions, type SourceAdapter, type SourceItem } from "./types";

/**
 * Stack Overflow via the Stack Exchange API. No key needed for low volume
 * (300 requests/day per IP); set STACKEXCHANGE_KEY to raise it to 10k. The API
 * is gzip-only, which fetch handles transparently.
 *
 * Read-only. Answering on SO happens under one real account, and SO's own
 * rules require an explicit affiliation disclosure in any answer that names
 * your product — the channel policy in the Playbook enforces that.
 */

interface SoItem {
  question_id: number;
  title: string;
  body?: string;
  link: string;
  owner?: { display_name?: string } | null;
  score: number;
  answer_count: number;
  creation_date: number;
  tags?: string[];
  is_answered?: boolean;
}

const API = "https://api.stackexchange.com/2.3/search/advanced";

export const stackOverflowAdapter: SourceAdapter = {
  platform: "STACKOVERFLOW",
  async fetch({ keywords, scope, since, limit = 30 }: FetchOptions): Promise<SourceItem[]> {
    if (keywords.length === 0 && scope.length === 0) return [];
    const key = process.env.STACKEXCHANGE_KEY;
    const fromDate = Math.floor(since.getTime() / 1000);
    const out = new Map<string, SourceItem>();
    const tagged = scope.map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 5).join(";");

    // With no keywords, watch the tags themselves; otherwise one query per term.
    const terms = keywords.length ? keywords.slice(0, 8) : [""];
    for (const term of terms) {
      const params = new URLSearchParams({
        order: "desc",
        sort: "creation",
        site: "stackoverflow",
        filter: "withbody",
        fromdate: String(fromDate),
        pagesize: String(Math.min(limit, 50)),
        ...(term ? { q: term } : {}),
        ...(tagged ? { tagged } : {}),
        ...(key ? { key } : {}),
      });
      const json = await getJson<{ items?: SoItem[] }>(`${API}?${params}`);
      for (const it of json.items ?? []) {
        const created = new Date(it.creation_date * 1000);
        if (created < since) continue;
        const id = `so_${it.question_id}`;
        out.set(id, {
          id,
          platform: "STACKOVERFLOW",
          kind: "POST",
          channel: it.tags?.[0] ?? "stackoverflow.com",
          title: stripHtml(it.title),
          body: stripHtml(it.body ?? "").slice(0, 6000),
          author: it.owner?.display_name ?? "unknown",
          permalink: it.link,
          url: it.link,
          score: it.score,
          numComments: it.answer_count,
          createdUtc: created,
        });
      }
    }
    return [...out.values()];
  },
};
