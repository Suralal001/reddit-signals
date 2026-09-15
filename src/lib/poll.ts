import { db } from "./db";
import { getRedditClient } from "./reddit";
import { scoreThreads, type ThreadForScoring } from "./ai";
import { sendAlert } from "./alerts";
import { getWorkspaceContext, appUrl } from "./settings";
import { matchKeywords, parseList, type MonitorKind } from "./util";
import { channelLabel, fetchFrom, parsePlatforms, parseSources, PLATFORM_META, type SourceItem } from "./sources";
import { refreshOperatorHealth, suggestOperator } from "./operators";
import { resolvePerson } from "./people";
import { applyCooldowns, checkPublicVisibility, recordIncident } from "./moderation";

export interface PollOptions {
  /** Poll one project only. Omitted (the cron route) means every project. */
  projectId?: string;
}

export interface PollSummary {
  runId: string;
  projectId: string | null;
  threadsSeen: number;
  newLeads: number;
  scored: number;
  alerts: number;
  repliesChecked: number;
  removals: number;
  assigned: number;
  people: number;
  byPlatform: Record<string, number>;
  errors: string[];
  durationMs: number;
}

/**
 * The whole pipeline, in one place:
 *   fetch (every platform) → dedupe → score → route to an operator → alert
 * Safe to run repeatedly; everything is idempotent on (threadId, monitorId).
 *
 * Scope: pass a projectId and nothing outside it is touched — not its monitors,
 * not its scoring, not its reply-stat refresh. The "Poll now" button passes the
 * project you are looking at, because a button under a project switcher that
 * quietly spends another project's Apify credit is a trap. The cron route
 * passes nothing and sweeps everything, which is what a scheduler should do.
 *
 * Note what this does NOT do: it never posts. Routing picks a suggested human
 * for each lead, and that human still has to read the draft and press the
 * button.
 */
export async function runPoll(opts: PollOptions = {}): Promise<PollSummary> {
  const started = Date.now();
  const onlyProject = opts.projectId ?? null;
  const run = await db.pollRun.create({ data: { projectId: onlyProject } });
  const errors: string[] = [];
  const byPlatform: Record<string, number> = {};
  let threadsSeen = 0;
  let newLeads = 0;
  let scored = 0;
  let alerts = 0;
  let repliesChecked = 0;
  let removals = 0;
  let assigned = 0;
  let newPeople = 0;

  try {
    const monitors = await db.monitor.findMany({
      where: { active: true, ...(onlyProject ? { projectId: onlyProject } : {}) },
    });

    // One workspace context per project — brand, competitors, voice, thresholds.
    const projectIds = [...new Set(monitors.map((m) => m.projectId))];
    // monitorId -> projectId, so a removal found in stage 5 can be filed against
    // the right project without another round trip.
    const monitorProject = new Map(monitors.map((m) => [m.id, m.projectId]));
    const ctxByProject = new Map<string, Awaited<ReturnType<typeof getWorkspaceContext>>>();
    for (const pid of projectIds) ctxByProject.set(pid, await getWorkspaceContext(pid));
    const anyCtx = ctxByProject.values().next().value ?? (await getWorkspaceContext());

    // 1. Fetch + dedupe, across every platform the monitor is enabled for ----
    for (const m of monitors) {
      const ctx = ctxByProject.get(m.projectId) ?? anyCtx;
      const since = new Date(Date.now() - ctx.lookbackDays * 86_400_000);
      const keywords = parseList(m.keywords);
      const subreddits = parseList(m.subreddits);
      const platforms = parsePlatforms(m.platforms);
      const sources = parseSources(m.sources);

      for (const platform of platforms) {
        const scope = platform === "REDDIT" ? subreddits : (sources[platform] ?? []);
        if (keywords.length === 0 && scope.length === 0) continue;

        let items: SourceItem[];
        try {
          items = await fetchFrom(platform, { keywords, scope, since, scanComments: m.scanComments, projectId: m.projectId });
        } catch (err) {
          errors.push(`${m.name} · ${PLATFORM_META[platform].label}: ${(err as Error).message}`);
          continue;
        }

        for (const it of items) {
          if (it.createdUtc < since) continue;
          threadsSeen++;
          byPlatform[platform] = (byPlatform[platform] ?? 0) + 1;

          await db.thread.upsert({
            where: { id: it.id },
            update: { score: it.score, numComments: it.numComments, fetchedAt: new Date() },
            create: {
              id: it.id,
              platform: it.platform,
              kind: it.kind,
              linkId: it.linkId ?? null,
              linkTitle: it.linkTitle ?? null,
              parentId: it.parentId ?? null,
              subreddit: it.channel,
              title: it.title,
              body: it.body,
              author: it.author,
              permalink: it.permalink,
              url: it.url,
              score: it.score,
              numComments: it.numComments,
              createdUtc: it.createdUtc,
            },
          });

          const existing = await db.lead.findUnique({
            where: { threadId_monitorId: { threadId: it.id, monitorId: m.id } },
            select: { id: true },
          });
          if (existing) continue;

          // Who posted this? Exact handle match within the project; a new
          // handle becomes a new person. Never blocks lead creation.
          let personId: string | null = null;
          try {
            const who = await resolvePerson(m.projectId, it.platform, it.author, it.createdUtc);
            personId = who.id;
            if (who.created) newPeople++;
          } catch (err) {
            errors.push(`identity ${it.author}: ${(err as Error).message}`);
          }

          await db.lead.create({
            data: {
              threadId: it.id,
              monitorId: m.id,
              personId,
              matchedKeywords: JSON.stringify(matchKeywords(`${it.title}\n${it.body}`, keywords)),
            },
          });
          newLeads++;
        }
      }
    }

    // 2. Score anything unscored --------------------------------------------
    const unscored = await db.lead.findMany({
      where: { scoredAt: null, ...(onlyProject ? { monitor: { projectId: onlyProject } } : {}) },
      include: { thread: true, monitor: true },
      take: 200,
    });
    if (unscored.length) {
      const byProject = new Map<string, typeof unscored>();
      for (const l of unscored) {
        const list = byProject.get(l.monitor.projectId) ?? [];
        list.push(l);
        byProject.set(l.monitor.projectId, list);
      }
      for (const [pid, group] of byProject) {
        const ctx = ctxByProject.get(pid) ?? (await getWorkspaceContext(pid));
        const inputs: ThreadForScoring[] = group.map((l) => ({
          id: l.id,
          kind: l.thread.kind as "POST" | "COMMENT",
          subreddit: l.thread.subreddit,
          title: l.thread.title,
          body: l.thread.body,
          monitorKind: l.monitor.kind as MonitorKind,
          monitorName: l.monitor.name,
        }));
        try {
          const scores = await scoreThreads(inputs, ctx);
          for (const s of scores) {
            await db.lead.update({
              where: { id: s.id },
              data: {
                relevance: s.relevance,
                intentScore: s.intent,
                intentReason: s.intentReason,
                sentiment: s.sentiment,
                summary: s.summary,
                angle: s.angle,
                signal: s.signal,
                scoredAt: new Date(),
              },
            });
            scored++;
          }
        } catch (err) {
          errors.push(`scoring: ${(err as Error).message}`);
        }
      }
    }

    // 3. Route the good ones to a person -------------------------------------
    // A suggestion, not an assignment of blame: whoever opens the lead can
    // reassign it. Leads nobody has capacity for simply stay unassigned.
    for (const [pid, pctx] of ctxByProject) {
      const toRoute = await db.lead.findMany({
        where: {
          assignedOperatorId: null,
          status: "NEW",
          scoredAt: { not: null },
          intentScore: { gte: Math.max(40, pctx.alertThreshold - 20) },
          relevance: { gte: 50 },
          monitor: { projectId: pid },
        },
        include: { thread: true, monitor: true },
        orderBy: { intentScore: "desc" },
        take: 50,
      });
      for (const l of toRoute) {
        try {
          const s = await suggestOperator(l);
          if (!s.operator) continue;
          await db.lead.update({ where: { id: l.id }, data: { assignedOperatorId: s.operator.id } });
          assigned++;
        } catch (err) {
          errors.push(`routing ${l.id}: ${(err as Error).message}`);
        }
      }
    }

    // 4. Alert on the good ones, per project ---------------------------------
    const toAlert: Array<(typeof unscored)[number]> = [];
    for (const [pid, pctx] of ctxByProject) {
      const found = await db.lead.findMany({
        where: {
          alertedAt: null,
          status: "NEW",
          intentScore: { gte: pctx.alertThreshold },
          relevance: { gte: 50 },
          monitor: { projectId: pid },
        },
        include: { thread: true, monitor: true },
        orderBy: { intentScore: "desc" },
        take: 20,
      });
      toAlert.push(...found);
    }
    for (const l of toAlert) {
      const ctx = ctxByProject.get(l.monitor.projectId) ?? anyCtx;
      const ok = await sendAlert(ctx.slackWebhook, {
        title: l.thread.title,
        subreddit: channelLabel(l.thread.platform, l.thread.subreddit),
        permalink: l.thread.permalink,
        intentScore: l.intentScore ?? 0,
        summary: l.summary,
        monitorName: l.monitor.name,
        monitorKind: l.monitor.kind,
        leadUrl: appUrl(`/leads/${l.id}`),
      });
      if (ok) alerts++;
      // Mark as handled either way so a webhook added later doesn't replay history.
      await db.lead.update({ where: { id: l.id }, data: { alertedAt: new Date() } });
    }

    // 5. Refresh performance of replies we posted (14 days, hourly) ----------
    // Reddit only: it's the one platform the app posts to.
    const staleBefore = new Date(Date.now() - 60 * 60_000);
    const toCheck = await db.reply.findMany({
      where: {
        status: "POSTED",
        redditId: { not: null },
        postedAt: { gte: new Date(Date.now() - 14 * 86_400_000) },
        OR: [{ checkedAt: null }, { checkedAt: { lt: staleBefore } }],
        ...(onlyProject ? { lead: { monitor: { projectId: onlyProject } } } : {}),
      },
      include: { lead: { include: { thread: true } } },
      orderBy: { checkedAt: "asc" },
      take: 30,
    });
    if (toCheck.length) {
      const reddit = getRedditClient();
      for (const r of toCheck) {
        const t = r.lead.thread;
        if (t.platform !== "REDDIT") continue;
        const linkId = t.kind === "COMMENT" ? (t.linkId ?? "") : t.id;
        try {
          const st = await reddit.commentStats(linkId, r.redditId!);

          // The authenticated read above is not proof the comment is up. Reddit
          // shows a removed comment to the account that wrote it exactly as if
          // nothing happened, so the honest check is a logged-out fetch of the
          // same permalink. This is the failure mode that lets a team post into
          // a void for a week and call it a quiet launch.
          const visible = await checkPublicVisibility(r);
          const wasVisible = r.publiclyVisible;

          await db.reply.update({
            where: { id: r.id },
            data: {
              score: st.score,
              replyCount: st.replyCount,
              removed: st.removed || visible === false,
              checkedAt: new Date(),
              publiclyVisible: visible,
              publicCheckedAt: visible === null ? r.publicCheckedAt : new Date(),
            },
          });
          await db.replyStat.create({ data: { replyId: r.id, score: st.score, replyCount: st.replyCount } });
          repliesChecked++;

          // Record it once, the first time we notice.
          if (wasVisible !== false && (st.removed || visible === false)) {
            const projectId = monitorProject.get(r.lead.monitorId);
            if (projectId) {
              await recordIncident({
                projectId,
                platform: "REDDIT",
                channel: t.subreddit,
                kind: visible === false && !st.removed ? "SHADOW_REMOVAL" : "REMOVAL",
                operatorId: r.operatorId,
                replyId: r.id,
                detail:
                  visible === false && !st.removed
                    ? "Still visible to the account that posted it, absent when logged out — removed silently, most likely by AutoModerator."
                    : "Marked removed by Reddit.",
              });
              removals++;
            }
          }
        } catch (err) {
          errors.push(`reply stats: ${(err as Error).message}`);
          await db.reply.update({ where: { id: r.id }, data: { checkedAt: new Date() } });
        }
      }
    }

    // 5b. Circuit breakers ---------------------------------------------------
    // Two removals in one community inside 30 days pauses that community for a
    // month. Nobody has to remember to do this, which is the point: the removal
    // that ends a programme is always the one everyone was too busy to notice.
    for (const pid of projectIds) {
      try {
        const cooled = await applyCooldowns(pid);
        for (const c of cooled) errors.push(`r/${c} paused for 30 days: repeated removals.`);
      } catch (err) {
        errors.push(`cooldowns: ${(err as Error).message}`);
      }
    }

    // 6. Operator health — karma, removal rate, shadowban probe --------------
    // Cheap and public; once per poll is plenty.
    for (const pid of projectIds) {
      try {
        const results = await refreshOperatorHealth(pid);
        for (const r of results.filter((x) => x.risk === "LIKELY")) {
          errors.push(`operator ${r.name}: ${r.note}`);
        }
      } catch (err) {
        errors.push(`operator health: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    errors.push((err as Error).message);
  }

  await db.pollRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      threadsSeen,
      newLeads,
      scored,
      alerts,
      error: errors.length ? errors.join("\n") : null,
    },
  });

  return {
    runId: run.id,
    projectId: onlyProject,
    threadsSeen,
    newLeads,
    scored,
    alerts,
    repliesChecked,
    removals,
    assigned,
    people: newPeople,
    byPlatform,
    errors,
    durationMs: Date.now() - started,
  };
}
