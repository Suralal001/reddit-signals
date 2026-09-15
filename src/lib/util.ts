/** Parse a JSON-encoded string[] column; tolerate garbage. */
export function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Turn a comma/newline separated textarea into a clean, de-duped list. */
export function splitList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,\n]/)) {
    const s = part.trim().replace(/^r\//i, "");
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out;
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Math.max(0, Date.now() - d.getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

/** Which of `keywords` literally appear in `text` (case-insensitive). */
export function matchKeywords(text: string, keywords: string[]): string[] {
  const hay = text.toLowerCase();
  return keywords.filter((k) => k && hay.includes(k.toLowerCase()));
}

export function scoreTone(score: number | null | undefined): "hot" | "warm" | "cool" | "none" {
  if (score == null) return "none";
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cool";
}

export const MONITOR_KINDS = ["LEAD", "BRAND", "COMPETITOR"] as const;
export type MonitorKind = (typeof MONITOR_KINDS)[number];

export const LEAD_STATUSES = ["NEW", "SAVED", "REPLIED", "DISMISSED"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isMock(which: "REDDIT" | "AI"): boolean {
  const v = process.env[`MOCK_${which}`];
  return v === "1" || v === "true";
}

export function redditUrl(permalink: string): string {
  return permalink.startsWith("http") ? permalink : `https://www.reddit.com${permalink}`;
}
