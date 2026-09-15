import { db } from "./db";
import { getSettings } from "./settings";
import { getActiveProjectId } from "./project";
import { parseList } from "./util";

/**
 * Moderator management.
 *
 * The thing that ends a Reddit programme is almost never one bad comment. It is
 * a pattern: the same domain appearing in twelve subs, two colleagues turning up
 * in one thread, a removal nobody noticed followed by four more just like it.
 * So this module is mostly memory and arithmetic — what happened to us where,
 * and what that means we may do next.
 *
 * Three findings from Reddit's own policy pages shape the rules below, and each
 * is the reason for a specific gate:
 *
 *  1. The ban-evasion filter is driven by "signals that imply certain accounts
 *     are related… how redditors connect to Reddit", and Reddit says plainly it
 *     "isn't 100% accurate". Several employees on one office network, posting
 *     about one brand, is the exact shape that filter approximates. So when one
 *     operator is banned in a subreddit, EVERY operator is blocked there — not
 *     as punishment, but because the others are now false-positive candidates.
 *     (support.reddithelp.com/hc/en-us/articles/15484544471444-Ban-evasion-filter)
 *
 *  2. Vote manipulation is defined to include coordinated voting that targets
 *     "content from a domain". Colleagues upvoting each other is inside the
 *     written rule even with no alt accounts, so nothing in this app may invite
 *     a teammate to engage with a teammate's comment. See NO_ENGAGEMENT_NOTICE.
 *     (support.reddithelp.com/hc/en-us/articles/360043066412-Disrupting-Communities)
 *
 *  3. AutoModerator's `remove` action is silent to the author, and a removed
 *     comment still renders normally for the account that wrote it. An
 *     authenticated check will therefore confirm a comment that nobody else can
 *     see, which is why visibility is verified logged-out.
 *
 * The old 10:1 self-promotion ratio is NOT current sitewide policy — it lives in
 * Reddiquette, not the Content Policy. What is enforceable is the Spam article's
 * test: contributions that "consist primarily of links to a business that you
 * run, own, or otherwise benefit from". That is a judgement about an account's
 * whole history, so the ratio here is a warning and a budget, never a green light.
 */

// ---- Channel standing ---------------------------------------------------------

export const CHANNEL_STATES = {
  WATCH_ONLY: {
    label: "Watch only",
    short: "Read it, never reply here.",
    tone: "muted",
    canReply: false,
  },
  UNVERIFIED: {
    label: "Sidebar unread",
    short: "Nobody has read this community's rules yet. Replies allowed; naming the brand is not.",
    tone: "warn",
    canReply: true,
  },
  READ_ONLY: {
    label: "Rules read",
    short: "Sidebar read and recorded. We have not asked the mods about naming the brand.",
    tone: "ok",
    canReply: true,
  },
  ASK_PENDING: {
    label: "Waiting on mods",
    short: "Permission request sent. Behave as if the answer is no until it arrives.",
    tone: "warn",
    canReply: true,
  },
  APPROVED: {
    label: "Approved",
    short: "The mod team said yes.",
    tone: "good",
    canReply: true,
  },
  CONDITIONAL: {
    label: "Approved with conditions",
    short: "Yes, but only on the terms recorded below.",
    tone: "good",
    canReply: true,
  },
  REFUSED: {
    label: "Refused",
    short: "The mods said no. Do not reply, do not ask again.",
    tone: "bad",
    canReply: false,
  },
  BANNED: {
    label: "Banned",
    short: "We are banned here. Every operator is blocked, not just the one who was banned.",
    tone: "bad",
    canReply: false,
  },
} as const;

export type ChannelState = keyof typeof CHANNEL_STATES;

export function channelStateLabel(s: string): string {
  return (CHANNEL_STATES as Record<string, { label: string }>)[s]?.label ?? s;
}

export const INCIDENT_KINDS = {
  REMOVAL: "Comment removed",
  SHADOW_REMOVAL: "Removed silently (visible only to us)",
  AUTOMOD_FILTER: "Caught by AutoModerator",
  SUB_BAN: "Banned from the subreddit",
  MOD_WARNING: "Warned by a moderator",
  DOMAIN_BAN: "Domain blocked",
  ACCOUNT_SUSPENSION: "Account suspended by Reddit",
} as const;

export type IncidentKind = keyof typeof INCIDENT_KINDS;

/** Goes on every alert and every internal list of a teammate's comment. */
export const NO_ENGAGEMENT_NOTICE =
  "Do not upvote or reply to a colleague's comment. Coordinated voting on content from one domain is what Reddit's rules actually prohibit, and it is enforced across every linked account.";

// ---- Helpers ------------------------------------------------------------------

const DAY = 86_400_000;

export function namesBrand(text: string, brandName: string): boolean {
  const b = brandName.trim();
  if (!b) return false;
  return new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

export function linksIn(text: string): string[] {
  return text.match(/https?:\/\/[^\s)>\]]+/gi) ?? [];
}

export function mentionsDomain(text: string, domain: string): boolean {
  const d = domain.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  if (!d) return false;
  return new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text);
}

// ---- The gate -----------------------------------------------------------------

export interface GateFinding {
  code: string;
  level: "block" | "warn";
  message: string;
}

export interface GateResult {
  allowed: boolean;
  findings: GateFinding[];
  /** Set when the whole programme is paused, not just this channel. */
  halted: boolean;
}

export interface GateInput {
  projectId: string;
  platform: string;
  channel: string;
  threadId: string;
  operatorId: string;
  text: string;
}

/**
 * Everything that must be true before a comment may be posted in a channel.
 * Runs server-side in postReply; the composer shows the same result so nobody is
 * surprised at the last second.
 *
 * A blocked gate can be overridden, but only with a written reason that is
 * stored on the reply. Ignoring a warning at 11pm is free; writing down why you
 * ignored it is not, and that asymmetry is the whole point.
 */
export async function channelGate(input: GateInput): Promise<GateResult> {
  const { projectId, platform, channel, operatorId, text } = input;
  const f: GateFinding[] = [];
  const now = new Date();

  const [settings, rule, operator] = await Promise.all([
    getSettings(projectId),
    db.subredditRule.findFirst({ where: { projectId, platform, name: channel } }),
    db.subredditOperator.findUnique({ where: { id: operatorId } }),
  ]);

  const brandNamed = namesBrand(text, settings.brandName);
  const domainLinked = Boolean(settings.brandDomain) && mentionsDomain(text, settings.brandDomain);
  const hasLink = linksIn(text).length > 0;

  // -- 1. Programme-wide halt -------------------------------------------------
  // Removals in three different communities inside a fortnight is not three
  // separate mistakes, it is one pattern that Reddit's spam filter is already
  // watching. Stop everywhere and look at the domain before posting again.
  const recentIncidents = await db.channelIncident.findMany({
    where: {
      projectId,
      resolvedAt: null,
      at: { gte: new Date(now.getTime() - 14 * DAY) },
      kind: { in: ["REMOVAL", "SHADOW_REMOVAL", "AUTOMOD_FILTER"] },
    },
    select: { channel: true },
  });
  const affected = new Set(recentIncidents.map((i) => i.channel));
  const halted = affected.size >= 3;
  if (halted) {
    f.push({
      code: "PROGRAM_HALT",
      level: "block",
      message: `Replies are paused everywhere: ${affected.size} communities have removed something of ours in the last 14 days (${[...affected].join(", ")}). Check whether ${settings.brandDomain || "the domain"} is being filtered before anyone posts again.`,
    });
  }

  // -- 2. Domain-level block --------------------------------------------------
  const domainBan = await db.channelIncident.findFirst({
    where: { projectId, kind: "DOMAIN_BAN", resolvedAt: null },
  });
  if (domainBan && (domainLinked || hasLink)) {
    f.push({
      code: "DOMAIN_BANNED",
      level: "block",
      message: `${settings.brandDomain || "The domain"} is recorded as blocked (${domainBan.channel}). Do not post links anywhere until that is cleared — a sitewide domain filter is recoverable, but slowly and at Reddit's discretion.`,
    });
  }

  // -- 3. Channel standing ----------------------------------------------------
  const state = (rule?.state ?? "UNVERIFIED") as ChannelState;
  const meta = CHANNEL_STATES[state] ?? CHANNEL_STATES.UNVERIFIED;
  if (!meta.canReply) {
    f.push({
      code: `CHANNEL_${state}`,
      level: "block",
      message: `r/${channel} is marked "${meta.label}". ${meta.short}${rule?.conditions ? ` Recorded: ${rule.conditions}` : ""}`,
    });
  }
  if (rule?.cooldownUntil && rule.cooldownUntil > now) {
    f.push({
      code: "CHANNEL_COOLDOWN",
      level: "block",
      message: `r/${channel} is cooling off until ${rule.cooldownUntil.toDateString()}. ${rule.cooldownReason || "Something of ours was removed here recently."} Reposting after a removal is the step that turns a soft removal into a ban.`,
    });
  }
  if (state === "UNVERIFIED" && brandNamed) {
    f.push({
      code: "RULES_UNVERIFIED",
      level: "block",
      message: `Nobody has read r/${channel}'s rules yet, so naming ${settings.brandName} here is a guess. Read the sidebar, record it on the channel, then post.`,
    });
  }
  if (rule?.recheckDueAt && rule.recheckDueAt < now) {
    f.push({
      code: "RULES_STALE",
      level: "warn",
      message: `r/${channel}'s rules were last checked ${rule.verifiedAt?.toDateString() ?? "a while ago"} and are due a re-read. Sidebars change without announcement.`,
    });
  }

  // -- 4. Ban contagion -------------------------------------------------------
  // The single most important rule here. Once one of our accounts is banned in a
  // community, Reddit's ban-evasion filter starts treating accounts it thinks are
  // related as evading — and it decides relatedness from how people connect, not
  // from anything we control. A second colleague posting there is not a fresh
  // start, it is the thing the filter is looking for.
  const ban = await db.channelIncident.findFirst({
    where: { projectId, platform, channel, kind: "SUB_BAN", resolvedAt: null },
  });
  if (ban) {
    f.push({
      code: "BAN_CONTAGION",
      level: "block",
      message: `One of our accounts is banned in r/${channel}, so every operator is blocked here — including people who have never posted in it. Reddit's ban-evasion filter infers which accounts are related from how they connect, and a colleague replying now reads as evasion rather than as a different person.`,
    });
  }

  // -- 5. AutoModerator thresholds -------------------------------------------
  // AutoMod's remove action is silent. Below these numbers the comment does not
  // fail — it disappears, and the person who wrote it sees it sitting there.
  if (operator && !rule?.approvedUser) {
    if (rule?.minAccountAgeDays != null && (operator.accountAgeDays ?? 0) < rule.minAccountAgeDays) {
      f.push({
        code: "AUTOMOD_AGE",
        level: "block",
        message: `r/${channel} filters accounts under ${rule.minAccountAgeDays} days old and ${operator.name}'s is ${operator.accountAgeDays ?? "unknown"}. AutoModerator removes silently — the comment would look posted to ${operator.name} and be invisible to everyone else.`,
      });
    }
    if (rule?.minCommentKarma != null && (operator.karma ?? 0) < rule.minCommentKarma) {
      f.push({
        code: "AUTOMOD_KARMA",
        level: "block",
        message: `r/${channel} requires about ${rule.minCommentKarma} comment karma and ${operator.name} has ${operator.karma ?? "unknown"}. Same silent removal.`,
      });
    }
  }

  // -- 6. Conditions the mods actually set -----------------------------------
  if (rule?.requiredFlair && brandNamed) {
    f.push({
      code: "FLAIR_REQUIRED",
      level: "warn",
      message: `r/${channel} requires the "${rule.requiredFlair}" flair on brand comments. Confirm ${operator?.name ?? "the operator"} has it before posting — the app cannot see flair.`,
    });
  }
  if (rule?.promoThread && brandNamed) {
    f.push({
      code: "PROMO_THREAD_ONLY",
      level: "block",
      message: `r/${channel} keeps promotion to its ${rule.promoThread}. Naming ${settings.brandName} outside that thread is the removal this community actually issues. Answer without the brand here, or take it to the thread.`,
    });
  }

  // -- 7. Links, and the domain budget ---------------------------------------
  if (hasLink && !rule?.linksAllowed) {
    f.push({
      code: "LINK_NOT_ALLOWED",
      level: "block",
      message: `No link is recorded as allowed in r/${channel}. A reply that is complete without a link is also a reply that cannot be removed for having one.`,
    });
  }
  if (domainLinked) {
    const since = new Date(now.getTime() - 7 * DAY);
    const recent = await db.reply.findMany({
      where: { status: "POSTED", postedAt: { gte: since }, lead: { monitor: { projectId } } },
      select: { body: true },
    });
    const used = recent.filter((r) => mentionsDomain(r.body, settings.brandDomain)).length;
    if (used >= settings.domainLinkCap7d) {
      f.push({
        code: "DOMAIN_BUDGET",
        level: "block",
        message: `${settings.brandDomain} has already gone out ${used} time${used === 1 ? "" : "s"} this week across all communities, which is the cap. The domain is the one asset shared by every subreddit and the one that cannot be swapped out if it gets filtered.`,
      });
    }
  }

  // -- 8. Share of voice in this community -----------------------------------
  if (brandNamed && rule) {
    const since = new Date(now.getTime() - 30 * DAY);
    const here = await db.reply.findMany({
      where: {
        status: "POSTED",
        postedAt: { gte: since },
        lead: { monitor: { projectId }, thread: { subreddit: channel, platform } },
      },
      select: { body: true },
    });
    const named = here.filter((r) => namesBrand(r.body, settings.brandName)).length;
    if (named >= rule.mentionCap30d) {
      f.push({
        code: "MENTION_CAP",
        level: "block",
        message: `${settings.brandName} has been named ${named} time${named === 1 ? "" : "s"} in r/${channel} in the last 30 days, which is the cap set for this community. Regulars notice a brand that keeps turning up long before a moderator does.`,
      });
    }
  }

  // -- 9. Two of us in one place on one day ----------------------------------
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const othersToday = await db.reply.count({
    where: {
      status: "POSTED",
      postedAt: { gte: dayStart },
      operatorId: { not: operatorId },
      lead: { monitor: { projectId }, thread: { subreddit: channel, platform } },
    },
  });
  if (othersToday > 0) {
    f.push({
      code: "SAME_DAY_CHANNEL",
      level: "block",
      message: `A colleague already replied in r/${channel} today. Two of our accounts in one community on one day is the correlation the ban-evasion filter is built to notice. Tomorrow is fine.`,
    });
  }

  // -- 10. What this account's history looks like -----------------------------
  if (brandNamed && operator) {
    const since = new Date(now.getTime() - 90 * DAY);
    const mine = await db.reply.findMany({
      where: { status: "POSTED", operatorId, postedAt: { gte: since } },
      select: { body: true },
    });
    const named = mine.filter((r) => namesBrand(r.body, settings.brandName)).length + 1;
    const total = mine.length + 1;
    if (total >= 5 && named / total > 0.2) {
      f.push({
        code: "RATIO",
        level: "warn",
        message: `${Math.round((named / total) * 100)}% of ${operator.name}'s replies in the last 90 days name ${settings.brandName}. Reddit's spam rule is about whether an account's contributions "consist primarily of" promotion of a business — and it counts everything the account does, not just what goes through this app.`,
      });
    }
  }

  return { allowed: !f.some((x) => x.level === "block"), findings: f, halted };
}

// ---- Incidents and circuit breakers -------------------------------------------

export async function recordIncident(input: {
  projectId: string;
  platform?: string;
  channel: string;
  kind: IncidentKind;
  operatorId?: string | null;
  replyId?: string | null;
  detail?: string;
}): Promise<void> {
  await db.channelIncident.create({
    data: {
      projectId: input.projectId,
      platform: input.platform ?? "REDDIT",
      channel: input.channel,
      kind: input.kind,
      operatorId: input.operatorId ?? null,
      replyId: input.replyId ?? null,
      detail: input.detail ?? "",
    },
  });
}

/**
 * Turn incidents into cooldowns. Two removals in one community inside 30 days
 * means that community does not want us, whatever the sidebar says; the answer
 * is to stop for a month, not to write a better comment.
 */
export async function applyCooldowns(projectId: string): Promise<string[]> {
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY);
  const incidents = await db.channelIncident.findMany({
    where: {
      projectId,
      resolvedAt: null,
      at: { gte: since },
      kind: { in: ["REMOVAL", "SHADOW_REMOVAL", "AUTOMOD_FILTER"] },
    },
    select: { channel: true, platform: true },
  });

  const byChannel = new Map<string, { platform: string; n: number }>();
  for (const i of incidents) {
    const cur = byChannel.get(i.channel) ?? { platform: i.platform, n: 0 };
    cur.n++;
    byChannel.set(i.channel, cur);
  }

  const cooled: string[] = [];
  for (const [channel, { platform, n }] of byChannel) {
    if (n < 2) continue;
    const rule = await db.subredditRule.findFirst({ where: { projectId, platform, name: channel } });
    if (!rule) continue;
    if (rule.cooldownUntil && rule.cooldownUntil > now) continue;
    await db.subredditRule.update({
      where: { id: rule.id },
      data: {
        cooldownUntil: new Date(now.getTime() + 30 * DAY),
        cooldownReason: `${n} removals here in the last 30 days. Paused automatically; clear it once someone has read the removal reasons and, if it fits, sent one apologetic modmail.`,
      },
    });
    cooled.push(channel);
  }
  return cooled;
}

/**
 * Did that comment actually survive? Reddit shows a removed comment to the
 * account that wrote it exactly as if nothing happened, so the only honest check
 * is an unauthenticated read of the same permalink.
 */
export async function checkPublicVisibility(reply: {
  id: string;
  redditId: string | null;
  permalink: string | null;
}): Promise<boolean | null> {
  if (!reply.redditId || !reply.permalink) return null;
  const url = `https://www.reddit.com${reply.permalink.replace(/\/$/, "")}.json?raw_json=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": process.env.SONAR_USER_AGENT || "reddit-sonar/1.0 (visibility check)" },
      cache: "no-store",
    });
    if (!res.ok) return null; // network or rate limit — not evidence of removal
    const json = (await res.json()) as Array<{ data?: { children?: Array<{ kind: string; data: Record<string, unknown> }> } }>;
    const node = json?.[1]?.data?.children?.find((c) => c.kind === "t1" && String(c.data.id) === reply.redditId);
    if (!node) return false;
    const body = String(node.data.body ?? "");
    return body !== "[removed]" && body !== "[deleted]";
  } catch {
    return null;
  }
}

// ---- Talking to the moderators ------------------------------------------------

/**
 * Reddit's spam policy names "unsolicited bulk messages" outright, so a
 * templated ask sent to fifteen mod teams in an afternoon is a sitewide
 * offence rather than a faux pas. Two a week, each one written for the
 * community it is going to, and never a second ask after a refusal.
 */
export const OUTREACH_CAP_7D = 2;

export async function outreachBudget(projectId: string): Promise<{ sent: number; cap: number; left: number }> {
  const since = new Date(Date.now() - 7 * DAY);
  const sent = await db.modOutreach.count({ where: { projectId, sentAt: { gte: since } } });
  return { sent, cap: OUTREACH_CAP_7D, left: Math.max(0, OUTREACH_CAP_7D - sent) };
}

export interface ModmailDraft {
  subject: string;
  body: string;
  notes: string[];
}

/**
 * A starting point, not a template to fire at everyone. The whole reason this
 * works is that a mod can tell it was written for their community, so the
 * placeholders are deliberately impossible to leave in.
 */
export async function draftModmail(ruleId: string): Promise<ModmailDraft> {
  const rule = await db.subredditRule.findUniqueOrThrow({ where: { id: ruleId } });
  const settings = await getSettings(rule.projectId);
  const operators = await db.subredditOperator.findMany({
    where: { projectId: rule.projectId, active: true },
    orderBy: { createdAt: "asc" },
    take: 1,
  });
  const op = operators[0];
  const who = op ? `${op.name} (u/${op.handle})` : "[your name] (u/[your handle])";
  const brand = settings.brandName || "[brand]";

  const subject = `Question about brand participation in r/${rule.name}`;
  const body = [
    `Hi r/${rule.name} mods,`,
    ``,
    `I'm ${who} and I work at ${brand}. Before commenting here I wanted to ask rather than assume.`,
    ``,
    `[One specific sentence about this community: a thread you have read here, or the rule you are asking about. Delete this line and write it yourself — a message that could have been sent to any subreddit will be read as exactly that.]`,
    ``,
    `What I'd like to do is answer questions in my area — [the specific topic] — and say who I work for whenever it's relevant, in the comment itself rather than in a bio. I'm not looking to post links, run giveaways, or submit anything promotional.`,
    ``,
    `If that's not welcome here, that's a completely fair answer and I won't post. If it is welcome with conditions — a flair, a particular thread, no product names at all — tell me the conditions and I'll follow them.`,
    ``,
    `Thanks for reading,`,
    `${who}`,
  ].join("\n");

  const notes = [
    "Send this from your own account, to one subreddit, after you have actually read a few threads there.",
    "Replace the bracketed lines. A mod team can spot a mail-merge instantly, and Reddit's spam policy treats unsolicited bulk messages as a sitewide offence.",
    `Budget: ${OUTREACH_CAP_7D} permission requests a week across all communities.`,
    "If the answer is no, record it and never ask again. A second ask is how a refusal becomes a ban.",
  ];
  return { subject, body, notes };
}

// ---- Read models for the UI ---------------------------------------------------

export interface ChannelHealth {
  id: string;
  channel: string;
  platform: string;
  policy: string;
  state: ChannelState;
  stateLabel: string;
  verified: boolean;
  conditions: string;
  approvedUser: boolean;
  promoThread: string;
  requiredFlair: string;
  linksAllowed: boolean;
  mentionCap30d: number;
  verifiedBy: string;
  rulesUrl: string;
  minAccountAgeDays: number | null;
  minCommentKarma: number | null;
  cooldownUntil: Date | null;
  cooldownReason: string;
  recheckOverdue: boolean;
  modHandles: string[];
  incidents30d: number;
  lastIncidentAt: Date | null;
  repliesPosted30d: number;
  removed30d: number;
  outreachOutcome: string | null;
  outreachSentAt: Date | null;
}

export async function channelHealth(projectId?: string): Promise<ChannelHealth[]> {
  const pid = projectId ?? (await getActiveProjectId());
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY);

  const [rules, incidents, replies, outreach] = await Promise.all([
    db.subredditRule.findMany({ where: { projectId: pid }, orderBy: [{ platform: "asc" }, { name: "asc" }] }),
    db.channelIncident.findMany({ where: { projectId: pid, at: { gte: since } }, select: { channel: true, at: true } }),
    db.reply.findMany({
      where: { status: "POSTED", postedAt: { gte: since }, lead: { monitor: { projectId: pid } } },
      select: { removed: true, publiclyVisible: true, lead: { select: { thread: { select: { subreddit: true } } } } },
    }),
    db.modOutreach.findMany({ where: { projectId: pid }, orderBy: { draftedAt: "desc" } }),
  ]);

  const inc = new Map<string, { n: number; last: Date | null }>();
  for (const i of incidents) {
    const cur = inc.get(i.channel) ?? { n: 0, last: null };
    cur.n++;
    if (!cur.last || i.at > cur.last) cur.last = i.at;
    inc.set(i.channel, cur);
  }
  const rep = new Map<string, { posted: number; removed: number }>();
  for (const r of replies) {
    const ch = r.lead.thread.subreddit;
    const cur = rep.get(ch) ?? { posted: 0, removed: 0 };
    cur.posted++;
    if (r.removed || r.publiclyVisible === false) cur.removed++;
    rep.set(ch, cur);
  }
  const out = new Map<string, (typeof outreach)[number]>();
  for (const o of outreach) if (!out.has(o.ruleId)) out.set(o.ruleId, o);

  return rules.map((r) => {
    const i = inc.get(r.name) ?? { n: 0, last: null };
    const p = rep.get(r.name) ?? { posted: 0, removed: 0 };
    const o = out.get(r.id) ?? null;
    return {
      id: r.id,
      channel: r.name,
      platform: r.platform,
      policy: r.policy,
      state: (r.state as ChannelState) ?? "UNVERIFIED",
      stateLabel: channelStateLabel(r.state),
      verified: r.verified,
      conditions: r.conditions,
      approvedUser: r.approvedUser,
      promoThread: r.promoThread,
      requiredFlair: r.requiredFlair,
      linksAllowed: r.linksAllowed,
      mentionCap30d: r.mentionCap30d,
      verifiedBy: r.verifiedBy,
      rulesUrl: r.rulesUrl,
      minAccountAgeDays: r.minAccountAgeDays,
      minCommentKarma: r.minCommentKarma,
      cooldownUntil: r.cooldownUntil && r.cooldownUntil > now ? r.cooldownUntil : null,
      cooldownReason: r.cooldownReason,
      recheckOverdue: Boolean(r.recheckDueAt && r.recheckDueAt < now),
      modHandles: parseList(r.modHandles),
      incidents30d: i.n,
      lastIncidentAt: i.last,
      repliesPosted30d: p.posted,
      removed30d: p.removed,
      outreachOutcome: o?.outcome ?? null,
      outreachSentAt: o?.sentAt ?? null,
    };
  });
}
