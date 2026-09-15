import { db } from "./db";
import { getSettings } from "./settings";
import { getActiveProjectId } from "./project";
import { SIGNALS } from "./playbook";
import { isPlatform, parsePlatforms, PLATFORM_META, type Platform } from "./sources/types";
import { platformReady } from "./sources";
import { actorRisk } from "./sources/apify";
import { isMock, type LeadStatus, type MonitorKind } from "./util";

export type LeadWithRefs = Awaited<ReturnType<typeof listLeads>>["leads"][number];

export interface LeadFilters {
  monitorId?: string;
  kind?: MonitorKind;
  status?: LeadStatus | "ALL";
  minScore?: number;
  q?: string;
  signal?: string;
  platform?: string;
  channel?: string;
  take?: number;
  projectId?: string;
}

export async function listLeads(f: LeadFilters = {}) {
  const status = f.status ?? "NEW";
  const projectId = f.projectId ?? (await getActiveProjectId());
  const leads = await db.lead.findMany({
    where: {
      ...(f.monitorId ? { monitorId: f.monitorId } : {}),
      monitor: { projectId, ...(f.kind ? { kind: f.kind } : {}) },
      ...(status !== "ALL" ? { status } : {}),
      ...(f.minScore ? { intentScore: { gte: f.minScore } } : {}),
      ...(f.signal ? { signal: f.signal } : {}),
      ...(f.platform || f.channel
        ? { thread: { ...(f.platform ? { platform: f.platform } : {}), ...(f.channel ? { subreddit: f.channel } : {}) } }
        : {}),
      ...(f.q ? { thread: { OR: [{ title: { contains: f.q } }, { body: { contains: f.q } }] } } : {}),
    },
    include: { thread: true, monitor: true },
    orderBy: [{ intentScore: "desc" }, { thread: { createdUtc: "desc" } }],
    take: f.take ?? 100,
  });
  return { leads };
}

export async function getLead(id: string) {
  return db.lead.findUnique({
    where: { id },
    include: {
      thread: true,
      monitor: true,
      replies: { orderBy: { createdAt: "desc" } },
      person: { include: { handles: true, account: true } },
    },
  });
}

/**
 * Everything else this human has said that we picked up, excluding the thread
 * being looked at. This is what stops a reply from repeating a point they have
 * already heard, or pitching someone who ruled us out last month.
 */
export async function personHistory(personId: string, excludeLeadId: string) {
  const leads = await db.lead.findMany({
    where: { personId, id: { not: excludeLeadId } },
    include: { thread: true, replies: { where: { status: "POSTED" }, orderBy: { postedAt: "desc" } } },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return {
    leads,
    repliedCount: leads.filter((l) => l.replies.length > 0).length,
  };
}

export async function dashboardStats(projectId?: string) {
  const pid = projectId ?? (await getActiveProjectId());
  const settings = await getSettings(pid);
  const since7d = new Date(Date.now() - 7 * 86_400_000);
  const since30d = new Date(Date.now() - 30 * 86_400_000);
  const [newLeads, hotLeads, replied30d, brandMentions7d, lastRun, monitors, replyScore] = await Promise.all([
    db.lead.count({ where: { status: "NEW", monitor: { kind: "LEAD", projectId: pid } } }),
    db.lead.count({
      where: { status: "NEW", intentScore: { gte: settings.alertThreshold }, relevance: { gte: 50 }, monitor: { projectId: pid } },
    }),
    db.reply.count({ where: { status: "POSTED", postedAt: { gte: since30d }, lead: { monitor: { projectId: pid } } } }),
    db.lead.findMany({
      where: { monitor: { kind: "BRAND", projectId: pid }, thread: { createdUtc: { gte: since7d } } },
      select: { sentiment: true },
    }),
    db.pollRun.findFirst({
      where: { OR: [{ projectId: pid }, { projectId: null }] },
      orderBy: { startedAt: "desc" },
    }),
    db.monitor.count({ where: { active: true, projectId: pid } }),
    db.reply.aggregate({ _sum: { score: true }, where: { status: "POSTED", postedAt: { gte: since30d }, lead: { monitor: { projectId: pid } } } }),
  ]);
  const neg = brandMentions7d.filter((m) => m.sentiment === "NEGATIVE").length;
  return {
    newLeads,
    hotLeads,
    replied30d,
    replyScore30d: replyScore._sum.score ?? 0,
    brandMentions7d: brandMentions7d.length,
    brandNegative7d: neg,
    lastRun,
    monitors,
    threshold: settings.alertThreshold,
  };
}

export interface SentimentDay {
  day: string; // YYYY-MM-DD
  label: string; // e.g. "Sep 3"
  positive: number;
  neutral: number;
  negative: number;
}

/** Daily sentiment counts for the last `days` days, for monitors of `kind`. */
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function sentimentSeries(kind: MonitorKind, days = 14, projectId?: string): Promise<SentimentDay[]> {
  const pid = projectId ?? (await getActiveProjectId());
  // Window = the last `days` calendar days, today included.
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));
  const rows = await db.lead.findMany({
    where: { monitor: { kind, projectId: pid }, scoredAt: { not: null }, thread: { createdUtc: { gte: since } } },
    select: { sentiment: true, thread: { select: { createdUtc: true } } },
  });
  const byDay = new Map<string, SentimentDay>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = dayKey(d);
    byDay.set(key, {
      day: key,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      positive: 0,
      neutral: 0,
      negative: 0,
    });
  }
  for (const r of rows) {
    const key = dayKey(r.thread.createdUtc);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    if (r.sentiment === "POSITIVE") bucket.positive++;
    else if (r.sentiment === "NEGATIVE") bucket.negative++;
    else bucket.neutral++;
  }
  return [...byDay.values()];
}

export async function listMonitorsWithCounts(projectId?: string) {
  const pid = projectId ?? (await getActiveProjectId());
  const monitors = await db.monitor.findMany({ where: { projectId: pid }, orderBy: { createdAt: "asc" } });
  const counts = await db.lead.groupBy({
    by: ["monitorId", "status"],
    _count: { _all: true },
  });
  return monitors.map((m) => {
    const mine = counts.filter((c) => c.monitorId === m.id);
    const total = mine.reduce((a, c) => a + c._count._all, 0);
    const open = mine.filter((c) => c.status === "NEW").reduce((a, c) => a + c._count._all, 0);
    return { ...m, total, open };
  });
}

// ---- Replies -----------------------------------------------------------------

export async function listPostedReplies(days = 30, projectId?: string) {
  const pid = projectId ?? (await getActiveProjectId());
  const since = new Date(Date.now() - days * 86_400_000);
  const replies = await db.reply.findMany({
    where: { status: "POSTED", postedAt: { gte: since }, lead: { monitor: { projectId: pid } } },
    include: {
      lead: { include: { thread: true, monitor: true } },
      stats: { orderBy: { at: "asc" }, select: { score: true, replyCount: true, at: true } },
    },
    orderBy: { postedAt: "desc" },
    take: 200,
  });
  const totalScore = replies.reduce((a, r) => a + (r.score ?? 0), 0);
  const totalReplies = replies.reduce((a, r) => a + (r.replyCount ?? 0), 0);
  const removed = replies.filter((r) => r.removed).length;
  const checked = replies.filter((r) => r.checkedAt).length;
  return {
    replies,
    totals: {
      posted: replies.length,
      totalScore,
      totalReplies,
      removed,
      avgScore: checked ? Math.round((totalScore / checked) * 10) / 10 : null,
    },
  };
}


// ---- Dashboard: channels -------------------------------------------------------

const DAY_MS = 86_400_000;
const dayOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export type ChannelStatus = "LIVE" | "MOCK" | "SETUP" | "OFF";

/** Friendly names for the places Apify actually reaches. */
const APIFY_CHANNEL_LABEL: Record<string, string> = {
  "x.com": "X",
  "linkedin.com": "LinkedIn (search)",
  "g2.com": "G2 reviews",
  "capterra.com": "Capterra reviews",
  "youtube.com": "YouTube",
  "sales-navigator": "Sales Navigator",
  web: "Web search",
};

export interface ChannelStat {
  /** Unique per card. Apify splits into one card per channel it reaches. */
  key: string;
  platform: Platform;
  /** Set for Apify sub-channels; scopes the queue link. */
  channel?: string;
  label: string;
  /** "monitors" for a platform, "actors" for an Apify channel. */
  unit: string;
  monitors: number;
  total: number;
  hot: number;
  replied: number;
  lastAt: Date | null;
  series: number[]; // one count per day, oldest first
  status: ChannelStatus;
  note: string;
}

/**
 * One row per platform the project actually watches: how much it brought in,
 * how much of it was worth answering, and whether the source is really running.
 * A channel with monitors pointed at it but nothing configured is the failure
 * this is meant to surface — silence looks identical to "no signal" otherwise.
 */
export async function channelActivity(projectId?: string, days = 14): Promise<ChannelStat[]> {
  const pid = projectId ?? (await getActiveProjectId());
  const settings = await getSettings(pid);
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const monitors = await db.monitor.findMany({
    where: { projectId: pid, active: true },
    select: { platforms: true },
  });
  const monitorCount = new Map<Platform, number>();
  for (const m of monitors) {
    for (const p of parsePlatforms(m.platforms)) monitorCount.set(p, (monitorCount.get(p) ?? 0) + 1);
  }
  if (monitorCount.size === 0) return [];

  const apifyActors = await db.apifyActor.findMany({
    where: { projectId: pid },
    select: { name: true, channel: true, actorId: true, active: true, riskAccepted: true, lastRunAt: true, lastError: true },
  });

  const leads = await db.lead.findMany({
    where: { monitor: { projectId: pid }, thread: { createdUtc: { gte: since } } },
    select: {
      status: true,
      intentScore: true,
      relevance: true,
      // subreddit carries the Apify channel (x.com, linkedin.com, …) — without
      // it every Apify lead buckets into "web" and the per-channel cards merge.
      thread: { select: { platform: true, subreddit: true, createdUtc: true } },
    },
  });

  type Agg = { total: number; hot: number; replied: number; lastAt: Date | null };
  const buckets = new Map<string, number>();
  const stats = new Map<Platform, Agg>();
  const perChannel = new Map<string, Agg>(); // Apify only, keyed by channel
  for (const l of leads) {
    const p = (isPlatform(l.thread.platform) ? l.thread.platform : "REDDIT") as Platform;
    const cur = stats.get(p) ?? { total: 0, hot: 0, replied: 0, lastAt: null };
    cur.total++;
    if ((l.intentScore ?? 0) >= settings.alertThreshold && (l.relevance ?? 0) >= 50) cur.hot++;
    if (l.status === "REPLIED") cur.replied++;
    if (!cur.lastAt || l.thread.createdUtc > cur.lastAt) cur.lastAt = l.thread.createdUtc;
    stats.set(p, cur);
    const day = dayOf(l.thread.createdUtc);
    buckets.set(`${p}|${day}`, (buckets.get(`${p}|${day}`) ?? 0) + 1);

    if (p === "APIFY") {
      const ch = l.thread.subreddit || "web";
      const c = perChannel.get(ch) ?? { total: 0, hot: 0, replied: 0, lastAt: null };
      c.total++;
      if ((l.intentScore ?? 0) >= settings.alertThreshold && (l.relevance ?? 0) >= 50) c.hot++;
      if (l.status === "REPLIED") c.replied++;
      if (!c.lastAt || l.thread.createdUtc > c.lastAt) c.lastAt = l.thread.createdUtc;
      perChannel.set(ch, c);
      buckets.set(`APIFY|${ch}|${day}`, (buckets.get(`APIFY|${ch}|${day}`) ?? 0) + 1);
    }
  }

  const dayKeys: string[] = [];
  for (let i = 0; i < days; i++) dayKeys.push(dayOf(new Date(since.getTime() + i * DAY_MS)));

  const out: ChannelStat[] = [];
  for (const [platform, monitorsOn] of monitorCount) {
    const ready = platformReady(platform);
    // Order matters. In mock mode a source really is returning fixtures, so
    // reporting "needs setup" because its credentials are absent would be a
    // lie — you'd go hunting for a config problem that isn't there.
    const mocked =
      platform === "REDDIT" ? isMock("REDDIT") : platform !== "APIFY" && isMockSources();

    // Apify is a transport, not a place. Split it into the channels it reaches
    // so "how is X doing" is answerable — one card labelled with the vendor
    // hides exactly the thing a reader is looking for.
    if (platform === "APIFY") {
      const channels = new Set<string>([
        ...apifyActors.map((a) => a.channel || "web"),
        ...[...perChannel.keys()],
      ]);
      if (channels.size === 0) channels.add("web");
      for (const ch of channels) {
        const st = perChannel.get(ch) ?? { total: 0, hot: 0, replied: 0, lastAt: null };
        const actor = apifyActors.find((a) => (a.channel || "web") === ch);
        let status: ChannelStatus = "LIVE";
        let note = "";
        if (!ready.ok) {
          status = "SETUP";
          note = ready.reason ?? "Needs configuration.";
        } else if (!actor) {
          status = "SETUP";
          note = "No actor reaches this channel any more. Add one on the Apify page.";
        } else if (/PASTE_ACTOR_ID/i.test(actor.actorId)) {
          status = "SETUP";
          note = `“${actor.name}” has no actor id yet — paste one from the Apify store.`;
        } else if (!actor.active) {
          status = "SETUP";
          note = `“${actor.name}” is paused — resume it on the Apify page.`;
        } else if (actorRisk(actor.actorId, actor.name).level === "ACKNOWLEDGE" && !actor.riskAccepted) {
          status = "SETUP";
          note = `“${actor.name}” needs its risk acknowledgement ticked before it will run.`;
        } else if (actor.lastError) {
          status = "SETUP";
          note = actor.lastError;
        } else if (!actor.lastRunAt) {
          status = "OFF";
          note = "Active — it runs on the next poll.";
        } else if (st.total === 0) {
          status = "OFF";
          note = "Ran, but nothing matched in this window. Try broader keywords.";
        }
        out.push({
          key: `APIFY:${ch}`,
          platform: "APIFY",
          channel: ch,
          label: APIFY_CHANNEL_LABEL[ch] ?? ch,
          unit: "actor",
          monitors: actor ? 1 : 0,
          total: st.total,
          hot: st.hot,
          replied: st.replied,
          lastAt: st.lastAt,
          series: dayKeys.map((k) => buckets.get(`APIFY|${ch}|${k}`) ?? 0),
          status,
          note,
        });
      }
      continue;
    }

    const s = stats.get(platform) ?? { total: 0, hot: 0, replied: 0, lastAt: null };
    let status: ChannelStatus = "LIVE";
    let note = "";
    if (mocked) {
      status = "MOCK";
      note =
        platform === "REDDIT"
          ? "Fixture threads. Set MOCK_REDDIT=0 in .env to read the real thing."
          : "Fixture items. Set MOCK_SOURCES=0 in .env to read the real thing.";
    } else if (!ready.ok) {
      status = "SETUP";
      note = ready.reason ?? "Needs configuration.";
    } else if (s.total === 0) {
      status = "OFF";
      note = "Running, but nothing matched in this window. Check the monitor's keywords.";
    } else {
      note = ready.reason ?? "";
    }
    out.push({
      key: platform,
      platform,
      label: PLATFORM_META[platform].label,
      unit: "monitor",
      monitors: monitorsOn,
      total: s.total,
      hot: s.hot,
      replied: s.replied,
      lastAt: s.lastAt,
      series: dayKeys.map((k) => buckets.get(`${platform}|${k}`) ?? 0),
      status,
      note,
    });
  }
  return out.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function isMockSources(): boolean {
  const v = process.env.MOCK_SOURCES;
  return v === "1" || v === "true";
}

// ---- Dashboard: signal mix ------------------------------------------------------

export interface SignalSlice {
  code: string;
  label: string;
  hot: boolean;
  count: number;
}

/** What kind of conversations we're actually finding, scored leads only. */
export async function signalMix(projectId?: string, days = 14): Promise<SignalSlice[]> {
  const pid = projectId ?? (await getActiveProjectId());
  const since = new Date(Date.now() - days * DAY_MS);
  const rows = await db.lead.groupBy({
    by: ["signal"],
    where: { monitor: { projectId: pid }, scoredAt: { not: null }, thread: { createdUtc: { gte: since } } },
    _count: { _all: true },
  });
  const counts = new Map(rows.map((r) => [r.signal ?? "NONE", r._count._all]));
  return SIGNALS.filter((s) => s.code !== "NONE")
    .map((s) => ({ code: s.code, label: s.label, hot: s.hot, count: counts.get(s.code) ?? 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
}

// ---- Dashboard: what needs a human ---------------------------------------------

export interface ActionQueue {
  worthAnswering: number;
  assigned: number;
  unassigned: number;
  repliesToday: number;
  capacityToday: number;
  operators: number;
  actorIssues: { name: string; error: string }[];
  threshold: number;
}

export async function actionQueue(projectId?: string): Promise<ActionQueue> {
  const pid = projectId ?? (await getActiveProjectId());
  const settings = await getSettings(pid);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const worthWhere = {
    status: "NEW",
    intentScore: { gte: settings.alertThreshold },
    relevance: { gte: 50 },
    monitor: { projectId: pid },
  } as const;

  const [worthAnswering, assigned, repliesToday, operators, actors] = await Promise.all([
    db.lead.count({ where: worthWhere }),
    db.lead.count({ where: { ...worthWhere, assignedOperatorId: { not: null } } }),
    db.reply.count({ where: { status: "POSTED", postedAt: { gte: dayStart }, lead: { monitor: { projectId: pid } } } }),
    db.subredditOperator.findMany({ where: { projectId: pid, active: true }, select: { dailyCap: true } }),
    db.apifyActor.findMany({ where: { projectId: pid }, select: { name: true, lastError: true } }),
  ]);

  return {
    worthAnswering,
    assigned,
    unassigned: worthAnswering - assigned,
    repliesToday,
    capacityToday: Math.min(
      operators.reduce((a, o) => a + o.dailyCap, 0),
      settings.dailyReplyCap,
    ),
    operators: operators.length,
    actorIssues: actors.filter((a) => a.lastError).map((a) => ({ name: a.name, error: a.lastError })),
    threshold: settings.alertThreshold,
  };
}
