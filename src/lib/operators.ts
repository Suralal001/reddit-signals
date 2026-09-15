import { db } from "./db";
import { getActiveProjectId } from "./project";
import { parseList } from "./util";
import { PLATFORM_META, isPlatform, type Platform } from "./sources/types";

/**
 * Operators are REAL, NAMED PEOPLE. One row per human per platform, using
 * their own account. This file is deliberately hostile to the alternative:
 * there is no way to mint accounts, no credential storage, no scheduler that
 * posts on its own. What it does provide is throughput — routing a queue of
 * drafts to the right person, capping how much any one account posts, and
 * refusing to let two of your people turn up in the same thread.
 *
 * Credentials never live in the database. Each operator has an `envKey`, and
 * posting as them reads REDDIT_OP_<envKey>_CLIENT_ID / _CLIENT_SECRET /
 * _USERNAME / _PASSWORD from the environment. Nobody but the account owner
 * ever types those.
 */

export type OperatorRow = Awaited<ReturnType<typeof listOperators>>[number];

export async function listOperators(projectId?: string) {
  const pid = projectId ?? (await getActiveProjectId());
  return db.subredditOperator.findMany({
    where: { projectId: pid },
    orderBy: [{ platform: "asc" }, { name: "asc" }],
  });
}

export function operatorEnvNames(envKey: string): string[] {
  const k = envKey.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (!k) return [];
  return [`REDDIT_OP_${k}_CLIENT_ID`, `REDDIT_OP_${k}_CLIENT_SECRET`, `REDDIT_OP_${k}_USERNAME`, `REDDIT_OP_${k}_PASSWORD`];
}

/** Does this operator have their own credentials wired up? */
export function operatorHasCredentials(op: { platform: string; envKey: string }): boolean {
  if (op.platform !== "REDDIT") return false; // only Reddit can be posted to from here
  const names = operatorEnvNames(op.envKey);
  return names.length > 0 && names.every((n) => Boolean(process.env[n]));
}

export function dayStart(d = new Date()): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

/** How many replies this operator has already posted today. */
export async function postedToday(operatorId: string): Promise<number> {
  return db.reply.count({ where: { operatorId, status: "POSTED", postedAt: { gte: dayStart() } } });
}

export interface Capacity {
  operatorId: string;
  used: number;
  cap: number;
  left: number;
}

export async function capacities(projectId?: string): Promise<Map<string, Capacity>> {
  const ops = await listOperators(projectId);
  const since = dayStart();
  const counts = await db.reply.groupBy({
    by: ["operatorId"],
    where: { status: "POSTED", postedAt: { gte: since }, operatorId: { in: ops.map((o) => o.id) } },
    _count: { _all: true },
  });
  const map = new Map<string, Capacity>();
  for (const o of ops) {
    const used = counts.find((c) => c.operatorId === o.id)?._count._all ?? 0;
    map.set(o.id, { operatorId: o.id, used, cap: o.dailyCap, left: Math.max(0, o.dailyCap - used) });
  }
  return map;
}

// ---- Thread locks ------------------------------------------------------------

export interface ThreadLock {
  locked: boolean;
  reason?: string;
  operatorName?: string;
}

/**
 * Two rules, both non-negotiable:
 *   1. We reply once per thread. A second reply from the same side reads as
 *      pressure and is the classic "this is a campaign" tell.
 *   2. Never two different people from the same project in one thread. That is
 *      exactly the pattern platforms label as brigading.
 */
export async function threadLock(threadId: string, operatorId: string | null): Promise<ThreadLock> {
  const thread = await db.thread.findUnique({ where: { id: threadId }, select: { id: true, linkId: true } });
  if (!thread) return { locked: false };

  // Everything hanging off the same root conversation counts as one thread.
  const rootIds = [thread.id, ...(thread.linkId ? [thread.linkId, `t1_${thread.linkId}`] : [])];
  const siblings = await db.thread.findMany({
    where: { OR: [{ id: { in: rootIds } }, ...(thread.linkId ? [{ linkId: thread.linkId }] : [])] },
    select: { id: true },
  });
  const ids = [...new Set([...rootIds, ...siblings.map((s) => s.id)])];

  const posted = await db.reply.findFirst({
    where: { status: "POSTED", lead: { threadId: { in: ids } } },
    include: { operator: { select: { name: true, handle: true } } },
    orderBy: { postedAt: "desc" },
  });
  if (!posted) return { locked: false };

  const who = posted.operator ? `${posted.operator.name} (u/${posted.operator.handle})` : "someone on the team";
  if (posted.operatorId && operatorId && posted.operatorId !== operatorId) {
    return {
      locked: true,
      operatorName: who,
      reason: `${who} already replied in this thread. Two people from the same side in one thread is the pattern platforms flag as brigading — leave it to them.`,
    };
  }
  return {
    locked: true,
    operatorName: who,
    reason: `${who} already replied in this thread. One reply per thread; if there's more to say, say it as an edit or leave it.`,
  };
}

// ---- Routing -----------------------------------------------------------------

export interface Suggestion {
  operator: OperatorRow | null;
  reason: string;
  alternatives: { operator: OperatorRow; note: string }[];
}

function expertiseScore(op: { expertise: string }, channel: string): number {
  const tags = parseList(op.expertise).map((t) => t.toLowerCase().replace(/^r\//, ""));
  const c = channel.toLowerCase().replace(/^r\//, "");
  if (tags.includes(c)) return 2;
  if (tags.some((t) => c.includes(t) || t.includes(c))) return 1;
  return 0;
}

/**
 * Who should take this lead? Platform first (an account only exists on one
 * platform), then who is credible in that channel, then who has capacity, then
 * whoever posted least recently — so no single account develops a rhythm.
 */
export async function suggestOperator(lead: {
  thread: { platform: string; subreddit: string };
  monitor: { projectId: string };
  assignedOperatorId?: string | null;
}): Promise<Suggestion> {
  const platform = isPlatform(lead.thread.platform) ? lead.thread.platform : "REDDIT";
  const ops = (await listOperators(lead.monitor.projectId)).filter((o) => o.platform === platform);
  if (ops.length === 0) {
    return {
      operator: null,
      reason: `No ${PLATFORM_META[platform].label} operator on file for this project. Add the real person who will reply, on the Operators page.`,
      alternatives: [],
    };
  }

  const caps = await capacities(lead.monitor.projectId);
  const now = Date.now();
  const scored = ops
    .filter((o) => o.active)
    .map((o) => {
      const cap = caps.get(o.id);
      const left = cap?.left ?? o.dailyCap;
      const exp = expertiseScore(o, lead.thread.subreddit);
      const idleHours = o.lastPostedAt ? (now - o.lastPostedAt.getTime()) / 3_600_000 : 999;
      const warming = o.warmedUntil && o.warmedUntil > new Date();
      const risk = o.shadowbanRisk !== "OK";
      const score =
        (left > 0 ? 100 : 0) + exp * 25 + Math.min(idleHours, 72) / 3 - (warming ? 40 : 0) - (risk ? 60 : 0);
      const notes: string[] = [];
      if (left <= 0) notes.push(`at their daily cap (${o.dailyCap})`);
      if (warming) notes.push("still warming up — no product mentions yet");
      if (risk) notes.push(`health flagged ${o.shadowbanRisk.toLowerCase()}`);
      if (exp >= 2) notes.push(`knows ${lead.thread.subreddit}`);
      return { op: o, score, left, notes };
    })
    .sort((a, b) => b.score - a.score);

  const usable = scored.filter((s) => s.left > 0);
  if (usable.length === 0) {
    return {
      operator: null,
      reason: "Everyone on this platform is at their daily cap. This is the cap doing its job — the lead keeps until tomorrow.",
      alternatives: scored.map((s) => ({ operator: s.op, note: s.notes.join("; ") })),
    };
  }

  const best = usable[0];
  const why = best.notes.length ? best.notes.join("; ") : `${best.left} of ${best.op.dailyCap} replies left today`;
  return {
    operator: best.op,
    reason: `${best.op.name} (u/${best.op.handle}) — ${why}.`,
    alternatives: usable.slice(1).map((s) => ({ operator: s.op, note: s.notes.join("; ") || `${s.left} left today` })),
  };
}

// ---- Health ------------------------------------------------------------------

const UA = process.env.SONAR_USER_AGENT || "reddit-sonar/1.0 (operator health check)";

interface PublicProfile {
  visible: boolean;
  karma: number | null;
  ageDays: number | null;
}

/**
 * Public, unauthenticated profile lookup. A shadowbanned Reddit account
 * returns 404 here while still looking normal to the person logged into it —
 * which is the whole reason this check exists. We never log in as anyone.
 */
async function fetchProfile(platform: string, handle: string): Promise<PublicProfile> {
  const h = handle.replace(/^u\//i, "").trim();
  if (platform === "REDDIT") {
    const res = await fetch(`https://www.reddit.com/user/${encodeURIComponent(h)}/about.json`, {
      headers: { "User-Agent": UA },
    });
    if (res.status === 404) return { visible: false, karma: null, ageDays: null };
    if (!res.ok) throw new Error(`Reddit profile lookup ${res.status}`);
    const json = (await res.json()) as { data?: { total_karma?: number; link_karma?: number; comment_karma?: number; created_utc?: number } };
    const d = json.data ?? {};
    const karma = d.total_karma ?? (d.link_karma ?? 0) + (d.comment_karma ?? 0);
    const ageDays = d.created_utc ? Math.floor((Date.now() / 1000 - d.created_utc) / 86_400) : null;
    return { visible: true, karma, ageDays };
  }
  if (platform === "HACKERNEWS") {
    const res = await fetch(`https://hacker-news.firebaseio.com/v0/user/${encodeURIComponent(h)}.json`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`HN profile lookup ${res.status}`);
    const json = (await res.json()) as { karma?: number; created?: number } | null;
    if (!json) return { visible: false, karma: null, ageDays: null };
    return {
      visible: true,
      karma: json.karma ?? 0,
      ageDays: json.created ? Math.floor((Date.now() / 1000 - json.created) / 86_400) : null,
    };
  }
  if (platform === "GITHUB") {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(h)}`, {
      headers: { "User-Agent": UA, Accept: "application/vnd.github+json" },
    });
    if (res.status === 404) return { visible: false, karma: null, ageDays: null };
    if (!res.ok) throw new Error(`GitHub profile lookup ${res.status}`);
    const json = (await res.json()) as { followers?: number; created_at?: string };
    return {
      visible: true,
      karma: json.followers ?? 0,
      ageDays: json.created_at ? Math.floor((Date.now() - Date.parse(json.created_at)) / 86_400_000) : null,
    };
  }
  return { visible: true, karma: null, ageDays: null };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export interface HealthResult {
  operatorId: string;
  name: string;
  risk: "OK" | "WATCH" | "LIKELY";
  note: string;
}

/**
 * Health for one operator. Three independent signals, because any one of them
 * alone produces false alarms:
 *   - profile reachable at all (a 404 on Reddit is the classic shadowban tell)
 *   - how many of our posted replies were removed
 *   - whether recent replies are all stuck at score 0/1 with no engagement
 */
export async function checkOperatorHealth(operatorId: string): Promise<HealthResult> {
  const op = await db.subredditOperator.findUniqueOrThrow({ where: { id: operatorId } });
  const since = new Date(Date.now() - 30 * 86_400_000);
  const replies = await db.reply.findMany({
    where: { operatorId, status: "POSTED", postedAt: { gte: since } },
    select: { score: true, removed: true, replyCount: true, checkedAt: true },
  });

  let profile: PublicProfile = { visible: true, karma: op.karma, ageDays: op.accountAgeDays };
  let probeError: string | null = null;
  try {
    profile = await fetchProfile(op.platform, op.handle);
  } catch (err) {
    probeError = (err as Error).message;
  }

  const checked = replies.filter((r) => r.checkedAt);
  const removed = replies.filter((r) => r.removed).length;
  const scores = checked.map((r) => r.score ?? 0);
  const med = median(scores);
  const removalRate = replies.length ? removed / replies.length : 0;
  const flatline = checked.length >= 4 && med <= 1 && checked.every((r) => (r.replyCount ?? 0) === 0);

  let risk: HealthResult["risk"] = "OK";
  const notes: string[] = [];

  if (!profile.visible) {
    risk = "LIKELY";
    notes.push("Public profile returns 404 — on Reddit this usually means the account is shadowbanned. Check /r/ShadowBan from a logged-out browser before posting again.");
  }
  if (removalRate >= 0.4 && replies.length >= 3) {
    risk = risk === "LIKELY" ? risk : "LIKELY";
    notes.push(`${removed} of ${replies.length} replies were removed in the last 30 days. Stop posting from this account and re-read the rules of the subs it posts in.`);
  } else if (removalRate >= 0.2 && replies.length >= 3) {
    if (risk === "OK") risk = "WATCH";
    notes.push(`${removed} of ${replies.length} replies removed — above the level where a mod is likely watching.`);
  }
  if (flatline) {
    if (risk === "OK") risk = "WATCH";
    notes.push("Recent replies are all at score 0–1 with no responses. Either the substance is off, or the comments aren't being shown.");
  }
  if (profile.ageDays != null && profile.ageDays < 30) {
    if (risk === "OK") risk = "WATCH";
    notes.push(`Account is ${profile.ageDays} days old. Most target subs auto-remove new accounts; participate without linking anything for a few more weeks.`);
  }
  if (probeError) notes.push(`Profile check failed: ${probeError}`);
  if (notes.length === 0) {
    notes.push(
      replies.length
        ? `${replies.length} replies in 30 days, median score ${med}, ${removed} removed.`
        : "No replies posted yet.",
    );
  }

  const note = notes.join(" ");
  await db.subredditOperator.update({
    where: { id: operatorId },
    data: {
      karma: profile.karma ?? op.karma,
      accountAgeDays: profile.ageDays ?? op.accountAgeDays,
      lastCheckedAt: new Date(),
      shadowbanRisk: risk,
      healthNote: note.slice(0, 900),
    },
  });
  await db.operatorCheck.create({
    data: {
      operatorId,
      karma: profile.karma ?? 0,
      posted: replies.length,
      removed,
      medianScore: med,
      visible: profile.visible,
    },
  });

  return { operatorId, name: op.name, risk, note };
}

/** Health for every active operator in a project; used by the poller. */
export async function refreshOperatorHealth(projectId?: string): Promise<HealthResult[]> {
  const ops = await listOperators(projectId);
  const out: HealthResult[] = [];
  for (const o of ops.filter((x) => x.active)) {
    try {
      out.push(await checkOperatorHealth(o.id));
    } catch (err) {
      out.push({ operatorId: o.id, name: o.name, risk: "WATCH", note: `Health check failed: ${(err as Error).message}` });
    }
  }
  return out;
}

export function riskTone(risk: string): { label: string; cls: string } {
  if (risk === "LIKELY") return { label: "At risk", cls: "bg-hot-soft text-hot" };
  if (risk === "WATCH") return { label: "Watch", cls: "bg-warm-soft text-warm" };
  return { label: "Healthy", cls: "bg-cool-soft text-cool" };
}

export function platformCanPost(platform: string): boolean {
  return isPlatform(platform) ? PLATFORM_META[platform].canPost : false;
}
