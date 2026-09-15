import { getJson, type FetchOptions, type SourceAdapter, type SourceItem } from "./types";

/**
 * GitHub issues and discussions via the official search API.
 * Unauthenticated: 10 requests/minute. With GITHUB_TOKEN (a classic PAT with
 * no scopes is enough for public search): 30/minute. Read-only.
 *
 * This is the highest-signal source for a developer infrastructure product:
 * "does X support persistent memory", "how do I stop the agent forgetting",
 * and competitor repos' issue trackers are where evaluation actually happens.
 */

interface GhItem {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user?: { login?: string } | null;
  comments?: number;
  reactions?: { total_count?: number } | null;
  created_at: string;
  repository_url?: string;
  pull_request?: unknown;
}

const API = "https://api.github.com/search/issues";

function repoOf(item: GhItem): string {
  const m = item.html_url.match(/github\.com\/([^/]+\/[^/]+)\//);
  if (m) return m[1];
  const r = item.repository_url ?? "";
  return r.replace("https://api.github.com/repos/", "") || "github.com";
}

export const githubAdapter: SourceAdapter = {
  platform: "GITHUB",
  async fetch({ keywords, scope, since, limit = 30 }: FetchOptions): Promise<SourceItem[]> {
    if (keywords.length === 0) return [];
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const sinceIso = since.toISOString().slice(0, 10);
    const out = new Map<string, SourceItem>();
    const repoFilter = scope
      .map((s) => s.trim())
      .filter((s) => /^[\w.-]+\/[\w.-]+$/.test(s))
      .map((s) => `repo:${s}`)
      .join(" ");

    // Unauthenticated search is rate-limited hard, so keep the fan-out small.
    for (const term of keywords.slice(0, token ? 8 : 3)) {
      const phrase = term.includes(" ") ? `"${term}"` : term;
      const q = [phrase, "in:title,body", "is:issue", `created:>=${sinceIso}`, repoFilter].filter(Boolean).join(" ");
      const params = new URLSearchParams({ q, sort: "created", order: "desc", per_page: String(Math.min(limit, 50)) });
      const json = await getJson<{ items?: GhItem[] }>(`${API}?${params}`, headers);
      for (const it of json.items ?? []) {
        if (it.pull_request) continue;
        const created = new Date(it.created_at);
        if (created < since) continue;
        const id = `gh_${it.id}`;
        out.set(id, {
          id,
          platform: "GITHUB",
          kind: "POST",
          channel: repoOf(it),
          title: it.title,
          body: (it.body ?? "").slice(0, 6000),
          author: it.user?.login ?? "unknown",
          permalink: it.html_url,
          url: it.html_url,
          score: it.reactions?.total_count ?? 0,
          numComments: it.comments ?? 0,
          createdUtc: created,
        });
      }
    }
    return [...out.values()];
  },
};
