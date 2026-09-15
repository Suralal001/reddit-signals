import { db } from "../db";
import { stripHtml, type SourceItem } from "./types";

/**
 * Apify: a configurable bridge to sources the built-in adapters can't reach —
 * X/Twitter, G2 and Capterra reviews, YouTube comments, search results.
 *
 * Two design decisions worth knowing:
 *
 * 1. This calls the Apify REST API, not Apify's MCP server. MCP exists so a
 *    model can choose which tool to run; the poller already knows, so putting a
 *    model in that loop would add latency, cost and a failure mode for nothing.
 *    MCP is the right way for a person to *explore* the store — not for a cron
 *    job to fetch rows.
 *
 * 2. Nothing about a specific actor is hardcoded. Actor ids change and get
 *    deprecated; an `input` template and a `mapping` per actor means a new
 *    source needs configuration, not a deploy.
 *
 * Two limits are enforced here rather than left to discipline:
 *   - actors that harvest people (profiles, employee lists, emails, phones)
 *     are refused outright, whoever signs off; LinkedIn content search is
 *     allowed only with a recorded acknowledgement. See actorRisk below.
 *   - anything shaped like an email address or phone number is stripped before
 *     it reaches the database, on every actor, unconditionally
 */

const API = "https://api.apify.com/v2";

/**
 * A problem found before anything was sent to Apify: no token, a blocked or
 * unacknowledged actor, a template that isn't valid JSON. These cost nothing,
 * so they must not consume the actor's daily run budget or push out its next
 * run — otherwise one typo locks a daily actor out for 24 hours.
 */
export class PreflightError extends Error {
  readonly preflight = true;
}

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

export type RiskLevel = "OK" | "ACKNOWLEDGE" | "BLOCKED";

/**
 * Two different lines, and the difference matters.
 *
 * BLOCKED — actors that build a database of humans: profile scrapers, employee
 * listers, email and phone finders. These are never allowed, on any platform,
 * whatever anyone signs off. It is what actually draws litigation (LinkedIn
 * went after Proxycurl for reselling profile data, not for reading posts), it
 * is the hard end of GDPR, and it would gut the people model, which is public
 * handles only by design.
 *
 * ACKNOWLEDGE — LinkedIn content search. Reading public posts is a breach of
 * LinkedIn's User Agreement, and LinkedIn has won on that claim where X lost
 * on the equivalent one. That is a business risk for the account owner to take
 * or refuse, not a decision this file should make silently — so it requires an
 * explicit, recorded sign-off per actor.
 */
const HARVESTER =
  /(profile|people[-_ ]?(search|find|scrap|data)|employee|recruiter|decision[-_ ]?maker|sales[-_ ]?navigator|verified[-_ ]?leads?|leads?[-_ ]?(scrap|find|list|export|gen)|lead[-_ ]?gen|email[-_ ]?(find|scrap|extract|hunt|verif|lookup)|contact[-_ ]?(find|scrap|list)|phone[-_ ]?(find|number)|prospect|b2b[-_ ]?(lead|email|database)|enrich)/i;
const LINKEDIN = /linked-?in/i;

export interface RiskVerdict {
  level: RiskLevel;
  reason: string;
}

export function actorRisk(actorId: string, name = ""): RiskVerdict {
  const hay = `${actorId} ${name}`;
  if (HARVESTER.test(hay)) {
    return {
      level: "BLOCKED",
      reason:
        "This looks like a profile, employee or contact harvester. Those are blocked outright: assembling a database of people is the pattern that actually gets scrapers sued — LinkedIn pursued Proxycurl over reselling profile data, not over reading posts — and it is the hard end of GDPR for a company selling compliance. Sonar's people model is public handles only, and that stays true. Use a content or post-search actor instead.",
    };
  }
  if (LINKEDIN.test(hay)) {
    return {
      level: "ACKNOWLEDGE",
      reason:
        "LinkedIn's User Agreement prohibits scraping, and LinkedIn has won on that claim where X lost on the equivalent one: hiQ was ordered to stop, delete everything and pay $500,000, and Proxycurl shut down in 2025 rather than fight. Enforcement in practice has gone after bulk profile harvesting and resale rather than keyword reads, but the contract breach is the same either way and the exposure sits with you, not with Apify. Tick “Risk accepted” on this actor to record that it is a deliberate decision.",
    };
  }
  return { level: "OK", reason: "" };
}

/** Kept for callers that only need a hard yes/no. */
export function actorIsBlocked(actorId: string, name = ""): string | null {
  const r = actorRisk(actorId, name);
  return r.level === "BLOCKED" ? r.reason : null;
}

// Contact data must not enter this system. Sonar's people model is public
// handles only, and one scraped email list would undo that.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Deliberately conservative: a phone number is 9+ digits, or 7+ behind a "+"
// country code. Without that floor "2026 2027" and "99.9 SLA" get eaten, and a
// scrubber that mangles ordinary text is one people switch off.
const PHONE_RE = /(?:\+\d{1,3}[\s.\-()]*)?(?:\(\d{2,4}\)[\s.\-]*)?\d{2,5}(?:[\s.\-]\d{2,6}){1,4}/g;

export function scrubContactData(text: string): string {
  return text.replace(EMAIL_RE, "[email removed]").replace(PHONE_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    const hasCountryCode = m.trimStart().startsWith("+");
    return digits.length >= 9 || (hasCountryCode && digits.length >= 7) ? "[number removed]" : m;
  });
}

// ---- Field mapping --------------------------------------------------------------

/**
 * Read one value out of an actor's output row. A spec is a `|`-separated list
 * of fallbacks, each of which may be a `/`-separated path:
 *   "author/name|username|user/screen_name"
 */
function pick(row: Record<string, unknown>, spec: string | undefined): unknown {
  if (!spec) return undefined;
  for (const alt of spec.split("|")) {
    let cur: unknown = row;
    for (const part of alt.trim().split("/")) {
      if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        cur = undefined;
        break;
      }
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
  const s = str(v);
  if (!s) return new Date();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export interface ApifyMapping {
  id?: string;
  title?: string;
  body?: string;
  author?: string;
  url?: string;
  createdAt?: string;
  score?: string;
  numComments?: string;
  channel?: string;
}

export const DEFAULT_MAPPING: ApifyMapping = {
  id: "id|url|link",
  title: "title|name|headline|text",
  body: "text|content|body|snippet|description|review|comment",
  author: "author/name|author|username|user/screen_name|reviewer|handle",
  url: "url|link|permalink|postUrl",
  createdAt: "createdAt|created_at|date|publishedAt|timestamp|publishedTime",
  score: "likeCount|likes|upvotes|score|rating",
  numComments: "replyCount|commentCount|replies|comments",
};

export function parseMapping(raw: string | null | undefined): ApifyMapping {
  if (!raw) return DEFAULT_MAPPING;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return DEFAULT_MAPPING;
    const out: ApifyMapping = { ...DEFAULT_MAPPING };
    for (const k of Object.keys(DEFAULT_MAPPING) as (keyof ApifyMapping)[]) {
      const val = (v as Record<string, unknown>)[k];
      if (typeof val === "string" && val.trim()) out[k] = val.trim();
    }
    if (typeof (v as Record<string, unknown>).channel === "string") out.channel = String((v as Record<string, unknown>).channel);
    return out;
  } catch {
    return DEFAULT_MAPPING;
  }
}

/**
 * Fill the template. Most actors take a keywords array; some — LinkedIn's post
 * scrapers among them — take a list of search URLs instead, so {{searchUrls}}
 * expands the actor's urlPattern once per keyword with {kw} url-encoded.
 */
export function renderInput(
  template: string,
  keywords: string[],
  since: Date,
  limit: number,
  urlPattern = "",
): Record<string, unknown> {
  const searchUrls = urlPattern ? keywords.map((k) => urlPattern.replace(/\{kw\}/g, encodeURIComponent(k))) : [];
  const raw = (template || "{}")
    .replace(/"?\{\{searchUrls\}\}"?/g, JSON.stringify(searchUrls))
    .replace(/"?\{\{keywords\}\}"?/g, JSON.stringify(keywords))
    .replace(/"?\{\{keywordsCsv\}\}"?/g, JSON.stringify(keywords.join(", ")))
    .replace(/"?\{\{since\}\}"?/g, JSON.stringify(since.toISOString()))
    .replace(/"?\{\{sinceDate\}\}"?/g, JSON.stringify(since.toISOString().slice(0, 10)))
    .replace(/"?\{\{limit\}\}"?/g, String(limit));
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch (err) {
    throw new PreflightError(`Input template isn't valid JSON once filled in: ${(err as Error).message}`);
  }
}

// ---- Running --------------------------------------------------------------------

export interface ActorConfig {
  id: string;
  name: string;
  actorId: string;
  channel: string;
  input: string;
  mapping: string;
  maxItems: number;
  timeoutSecs: number;
  /** Actors that take search URLs rather than keywords: {kw} is substituted per keyword. */
  urlPattern?: string;
  riskAccepted?: boolean;
}

/**
 * Run one actor and return its rows, normalised. Uses the synchronous endpoint
 * so a run is one request; Apify returns 408 past 300 seconds, so timeoutSecs
 * is capped below that.
 */
export async function runActor(cfg: ActorConfig, keywords: string[], since: Date): Promise<SourceItem[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new PreflightError("APIFY_TOKEN is not set in .env");
  const risk = actorRisk(cfg.actorId, cfg.name);
  if (risk.level === "BLOCKED") throw new PreflightError(risk.reason);
  if (risk.level === "ACKNOWLEDGE" && !cfg.riskAccepted) {
    throw new PreflightError(
      `Tick “Risk accepted” on this actor (Edit → Risk accepted → Save) before it will run. Nothing was sent to Apify, so this cost nothing.`,
    );
  }

  const limit = Math.max(1, Math.min(1000, cfg.maxItems || 100));
  const timeout = Math.max(30, Math.min(290, cfg.timeoutSecs || 120));
  const body = renderInput(cfg.input, keywords, since, limit, cfg.urlPattern ?? "");

  const params = new URLSearchParams({ timeout: String(timeout), limit: String(limit), format: "json" });
  const res = await fetch(`${API}/acts/${encodeURIComponent(cfg.actorId)}/run-sync-get-dataset-items?${params}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.status === 408) {
    throw new Error(`"${cfg.name}" didn't finish inside ${timeout}s. Lower Max items, or raise the timeout (Apify's own ceiling is 300s).`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Apify rejected the token (${res.status}). Check APIFY_TOKEN, and that the actor isn't a rental or full-permission actor.`);
  }
  if (res.status === 404) {
    throw new Error(`Actor "${cfg.actorId}" not found. Use the store id, in username~actor-name form.`);
  }
  if (!res.ok) {
    throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows)) return [];

  const map = parseMapping(cfg.mapping);
  const channel = cfg.channel || map.channel || "web";
  const out: SourceItem[] = [];

  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;

    const rawBody = stripHtml(str(pick(row, map.body)));
    const rawTitle = stripHtml(str(pick(row, map.title)));
    if (!rawBody && !rawTitle) continue;

    const url = str(pick(row, map.url));
    const rawId = str(pick(row, map.id)) || url || `${rawTitle}${rawBody}`.slice(0, 80);
    const id = `ap_${cfg.id.slice(-6)}_${rawId.replace(/[^\w-]+/g, "").slice(-48)}`;
    const created = toDate(pick(row, map.createdAt));
    if (created < since) continue;

    out.push({
      id,
      platform: "APIFY",
      kind: "POST",
      channel,
      title: scrubContactData(rawTitle || rawBody.slice(0, 120)),
      body: scrubContactData(rawBody).slice(0, 6000),
      author: scrubContactData(str(pick(row, map.author)) || "unknown").slice(0, 120),
      permalink: url,
      url,
      score: num(pick(row, map.score)),
      numComments: num(pick(row, map.numComments)),
      createdUtc: created,
    });
  }
  return out;
}

// ---- Scheduling -----------------------------------------------------------------

const dayKey = () => new Date().toISOString().slice(0, 10);

export function isDue(a: { lastRunAt: Date | null; cadenceHours: number; runsToday: number; maxRunsPerDay: number; runDate: string }): { due: boolean; why: string } {
  const today = dayKey();
  const usedToday = a.runDate === today ? a.runsToday : 0;
  if (usedToday >= a.maxRunsPerDay) return { due: false, why: `at its daily run cap (${a.maxRunsPerDay})` };
  if (!a.lastRunAt) return { due: true, why: "never run" };
  const hours = (Date.now() - a.lastRunAt.getTime()) / 3_600_000;
  if (hours < a.cadenceHours) return { due: false, why: `next run in ${Math.ceil(a.cadenceHours - hours)}h` };
  return { due: true, why: "due" };
}

/**
 * Every due actor for a project, run in turn. Actors are billed per run, so
 * cadence and the daily cap are checked before the request, not after — this
 * is the difference between $19 lasting a month and lasting a morning.
 */
export async function fetchApify(
  projectId: string,
  scope: string[],
  keywords: string[],
  since: Date,
  opts: { force?: boolean } = {},
): Promise<SourceItem[]> {
  if (!apifyConfigured()) return [];
  const all = await db.apifyActor.findMany({ where: { projectId }, orderBy: { name: "asc" } });
  const actors = all.filter((a) => a.active);

  const out: SourceItem[] = [];
  const errors: string[] = [];

  // A monitor naming an actor that is paused, renamed or deleted used to
  // produce nothing and say nothing — the same silent failure the channel
  // board exists to kill. Name it instead, so it reaches the poll summary.
  let wanted = actors;
  if (scope.length) {
    const norm = (v: string) => v.trim().toLowerCase();
    const byName = new Map(all.map((a) => [norm(a.name), a]));
    wanted = [];
    for (const s of scope) {
      const hit = byName.get(norm(s));
      if (!hit) errors.push(`no actor named “${s.trim()}” in this project — check the monitor's Apify scope`);
      else if (!hit.active) errors.push(`“${hit.name}” is paused — resume it on the Apify page`);
      else wanted.push(hit);
    }
  }

  const today = dayKey();

  for (const a of wanted) {
    const { due } = isDue(a);
    if (!due && !opts.force) continue;
    try {
      const items = await runActor(
        {
          id: a.id,
          name: a.name,
          actorId: a.actorId,
          channel: a.channel,
          input: a.input,
          mapping: a.mapping,
          maxItems: a.maxItems,
          timeoutSecs: a.timeoutSecs,
          urlPattern: a.urlPattern,
          riskAccepted: a.riskAccepted,
        },
        keywords,
        since,
      );
      out.push(...items);
      await db.apifyActor.update({
        where: { id: a.id },
        data: {
          lastRunAt: new Date(),
          lastItems: items.length,
          lastError: "",
          runsToday: a.runDate === today ? a.runsToday + 1 : 1,
          runDate: today,
        },
      });
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`${a.name}: ${msg}`);
      const preflight = err instanceof PreflightError;
      await db.apifyActor.update({
        where: { id: a.id },
        data: preflight
          ? // Nothing was sent, nothing was spent: record why, change nothing else.
            { lastError: msg.slice(0, 500) }
          : // A real run happened and failed — it consumed the attempt, so don't
            // let the poller retry it in a loop.
            {
              lastRunAt: new Date(),
              lastError: msg.slice(0, 500),
              runsToday: a.runDate === today ? a.runsToday + 1 : 1,
              runDate: today,
            },
      });
    }
  }

  if (out.length === 0 && errors.length) throw new Error(errors.join(" · "));
  return out;
}
