"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { runPoll, type PollSummary } from "./poll";
import { draftReply } from "./ai";
import { getRedditClient, getRedditClientForOperator } from "./reddit";
import { getSettings, getSubredditPolicy, getWorkspaceContext } from "./settings";
import { getActiveProjectId, PROJECT_COOKIE } from "./project";
import { capacities, checkOperatorHealth, listOperators, platformCanPost, suggestOperator, threadLock } from "./operators";
import { mergePeople, PERSON_STAGES, resolvePerson } from "./people";
import { actorRisk, apifyConfigured, DEFAULT_MAPPING, renderInput, runActor } from "./sources/apify";
import { isPlatform, PLATFORM_META, PLATFORMS, type Platform } from "./sources/types";
import { LEAD_STATUSES, MONITOR_KINDS, parseList, splitList, type LeadStatus, type MonitorKind } from "./util";
import { lintHasBlock, lintReply } from "./lint";
import {
  CHANNEL_STATES,
  applyCooldowns,
  channelGate,
  channelHealth,
  draftModmail,
  outreachBudget,
  recordIncident,
  type ChannelState,
  type GateResult,
  type IncidentKind,
} from "./moderation";
import {
  defaultsForSlug,
  PLAYBOOK_FIELDS,
  POLICIES,
  parsePlaybook,
  type PlaybookData,
  type PolicyCode,
} from "./playbook";

function revalidateAll() {
  for (const p of ["/", "/leads", "/brand", "/replies", "/monitors", "/settings", "/playbook", "/operators", "/people", "/apify", "/channels"]) revalidatePath(p);
}

// ---- Projects --------------------------------------------------------------

export async function setActiveProject(projectId: string) {
  await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true } });
  const { cookies } = await import("next/headers");
  (await cookies()).set(PROJECT_COOKIE, projectId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidateAll();
}

// ---- Polling ---------------------------------------------------------------

/** The sidebar button: this project only. The cron route polls everything. */
export async function pollNow(): Promise<PollSummary> {
  const r = await runPoll({ projectId: await getActiveProjectId() });
  revalidateAll();
  return r;
}

// ---- Leads -----------------------------------------------------------------

export async function setLeadStatus(leadId: string, status: LeadStatus) {
  if (!LEAD_STATUSES.includes(status)) throw new Error("bad status");
  await db.lead.update({ where: { id: leadId }, data: { status } });
  revalidateAll();
  revalidatePath(`/leads/${leadId}`);
}

export async function generateDraft(leadId: string, instructions?: string): Promise<{ replyId: string; body: string }> {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { thread: true, monitor: true } });
  const ctx = await getWorkspaceContext(lead.monitor.projectId);
  const sub = await getSubredditPolicy(lead.thread.subreddit, lead.monitor.projectId, lead.thread.platform);
  const body = await draftReply(
    {
      kind: lead.thread.kind as "POST" | "COMMENT",
      subreddit: lead.thread.subreddit,
      title: lead.thread.title,
      body: lead.thread.body,
      monitorKind: lead.monitor.kind as MonitorKind,
      angle: lead.angle,
      summary: lead.summary,
      signal: lead.signal,
      policy: sub.policy,
      policyNotes: sub.notes,
      instructions: instructions?.trim() || undefined,
    },
    ctx,
  );
  const reply = await db.reply.create({ data: { leadId, body, status: "DRAFT" } });
  revalidatePath(`/leads/${leadId}`);
  return { replyId: reply.id, body };
}

export async function postReply(
  leadId: string,
  body: string,
  opts: { authorAskedForTools?: boolean; operatorId?: string; overrideReason?: string } = {},
): Promise<{ ok: true; permalink: string } | { ok: false; error: string }> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Reply is empty." };
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { thread: true, monitor: true } });
  const platform = isPlatform(lead.thread.platform) ? lead.thread.platform : "REDDIT";

  // Platforms other than Reddit are read-only here on purpose: replying on HN,
  // GitHub or Stack Overflow happens in a browser, signed in as that person.
  if (!platformCanPost(platform)) {
    return {
      ok: false,
      error: `${PLATFORM_META[platform].label} replies aren't posted from this app — open the thread and reply from your own account. The draft stays here.`,
    };
  }

  // Who is posting? Explicit choice wins, then the routed assignee.
  const operatorId = opts.operatorId || lead.assignedOperatorId;
  if (!operatorId) {
    return { ok: false, error: "Pick who is replying. Every comment goes out under a real named account." };
  }
  const operator = await db.subredditOperator.findUnique({ where: { id: operatorId } });
  if (!operator || operator.projectId !== lead.monitor.projectId) {
    return { ok: false, error: "That operator doesn't belong to this project." };
  }
  if (!operator.active) return { ok: false, error: `${operator.name} is marked inactive.` };
  if (operator.platform !== platform) {
    return { ok: false, error: `${operator.name} is a ${PLATFORM_META[operator.platform as Platform]?.label ?? operator.platform} account; this thread is on ${PLATFORM_META[platform].label}.` };
  }
  if (operator.shadowbanRisk === "LIKELY") {
    return {
      ok: false,
      error: `${operator.name}'s account is flagged as at risk: ${operator.healthNote} Clear that before posting again.`,
    };
  }

  // One reply per thread, and never two of our people in the same thread.
  const lock = await threadLock(lead.threadId, operatorId);
  if (lock.locked) return { ok: false, error: lock.reason ?? "Someone already replied in this thread." };

  // Hard guardrails: same lint the composer shows, enforced server-side.
  const ws = await getSettings(lead.monitor.projectId);
  const sub = await getSubredditPolicy(lead.thread.subreddit, lead.monitor.projectId, platform);
  const issues = lintReply(text, {
    brandName: ws.brandName,
    competitors: parseList(ws.competitors),
    policy: sub.policy,
    authorAskedForTools: opts.authorAskedForTools,
  });
  if (lintHasBlock(issues)) {
    return { ok: false, error: issues.filter((i) => i.level === "block").map((i) => i.message).join(" ") };
  }

  // Warm-up gate: a new account has to earn the right to name the product.
  if (operator.warmedUntil && operator.warmedUntil > new Date()) {
    const brandNamed = ws.brandName && new RegExp(`\\b${ws.brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
    if (brandNamed) {
      return {
        ok: false,
        error: `${operator.name} is still in warm-up until ${operator.warmedUntil.toDateString()}. Replies are welcome; naming the product from this account isn't, yet.`,
      };
    }
  }

  // Pacing: a per-person daily cap, plus the project-wide cap on top.
  const caps = await capacities(lead.monitor.projectId);
  const mine = caps.get(operatorId);
  if (mine && mine.left <= 0) {
    return { ok: false, error: `${operator.name} has hit their daily cap (${mine.cap}). That cap is what keeps the account looking like a person.` };
  }
  const projectStart = new Date();
  projectStart.setHours(0, 0, 0, 0);
  const postedToday = await db.reply.count({
    where: { status: "POSTED", postedAt: { gte: projectStart }, lead: { monitor: { projectId: lead.monitor.projectId } } },
  });
  if (postedToday >= ws.dailyReplyCap) {
    return { ok: false, error: `Project-wide daily cap reached (${ws.dailyReplyCap}). Raise it in Settings if you mean it.` };
  }

  // Standing with this community's moderators. Everything above is about us —
  // our caps, our accounts. This is about whether the people who run the room
  // want us in it, and what happened last time we were.
  const gate = await channelGate({
    projectId: lead.monitor.projectId,
    platform,
    channel: lead.thread.subreddit,
    threadId: lead.threadId,
    operatorId,
    text,
  });
  const blocks = gate.findings.filter((x) => x.level === "block");
  const override = (opts.overrideReason ?? "").trim();
  if (blocks.length && !override) {
    return {
      ok: false,
      error: blocks.map((b) => b.message).join("\n\n"),
    };
  }
  if (blocks.length && override.length < 15) {
    return {
      ok: false,
      error: "Overriding a moderation block needs a real reason, in writing. It gets stored on the reply so the next person can see why this one went out anyway.",
    };
  }
  // A halt is the one thing an override cannot clear: if three communities have
  // removed our comments in a fortnight, the problem is the programme, not this
  // reply, and the next post is what turns a pattern into a domain filter.
  if (gate.halted && blocks.some((b) => b.code === "PROGRAM_HALT")) {
    return { ok: false, error: blocks.find((b) => b.code === "PROGRAM_HALT")!.message };
  }

  // Keep the human in the loop: this is the only place a comment is ever posted,
  // and it is only ever reached from the "Post reply" button.
  const gateOverride = blocks.length
    ? `${new Date().toISOString()} · ${operator.name} overrode [${blocks.map((b) => b.code).join(", ")}]: ${override}`
    : "";
  const draft = await db.reply.findFirst({ where: { leadId, status: "DRAFT" }, orderBy: { createdAt: "desc" } });
  const reply = draft
    ? await db.reply.update({ where: { id: draft.id }, data: { body: text, operatorId, gateOverride } })
    : await db.reply.create({ data: { leadId, body: text, status: "DRAFT", operatorId, gateOverride } });
  try {
    const parent = lead.thread.kind === "COMMENT" ? lead.thread.id : `t3_${lead.thread.id}`;
    const client = getRedditClientForOperator(operator);
    const res = await client.postComment(parent, text);
    await db.reply.update({
      where: { id: reply.id },
      data: { status: "POSTED", redditId: res.id, permalink: res.permalink, postedAt: new Date() },
    });
    await db.lead.update({ where: { id: leadId }, data: { status: "REPLIED", assignedOperatorId: operatorId } });
    await db.subredditOperator.update({ where: { id: operatorId }, data: { lastPostedAt: new Date() } });
    // We've now spoken to this human in public.
    if (lead.personId) {
      const person = await db.person.findUnique({ where: { id: lead.personId }, select: { stage: true } });
      if (person?.stage === "SEEN") await db.person.update({ where: { id: lead.personId }, data: { stage: "ENGAGED" } });
    }
    revalidateAll();
    revalidatePath(`/leads/${leadId}`);
    return { ok: true, permalink: res.permalink };
  } catch (err) {
    const error = (err as Error).message;
    await db.reply.update({ where: { id: reply.id }, data: { status: "FAILED", error } });
    revalidatePath(`/leads/${leadId}`);
    return { ok: false, error };
  }
}

/** Reassign a lead to a different person (or clear the assignment). */
export async function assignLead(leadId: string, operatorId: string | null) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { monitor: true } });
  if (operatorId) {
    const op = await db.subredditOperator.findUniqueOrThrow({ where: { id: operatorId } });
    if (op.projectId !== lead.monitor.projectId) throw new Error("Operator belongs to another project");
  }
  await db.lead.update({ where: { id: leadId }, data: { assignedOperatorId: operatorId } });
  revalidatePath(`/leads/${leadId}`);
  revalidateAll();
}

/** Who does the router think should take this one, and why. */
export async function whoShouldReply(leadId: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId }, include: { thread: true, monitor: true } });
  const s = await suggestOperator(lead);
  return {
    operatorId: s.operator?.id ?? null,
    reason: s.reason,
    alternatives: s.alternatives.map((a) => ({ id: a.operator.id, name: a.operator.name, handle: a.operator.handle, note: a.note })),
  };
}

// ---- Manual signals ---------------------------------------------------------

/**
 * Paste a thread in by hand. This exists because LinkedIn has no keyword
 * search API and never will — a founder spots a good thread in their feed and
 * drops the link here, and it joins the same queue as everything else: scored,
 * drafted against the playbook, routed to a person. Nothing is fetched from
 * the URL; the text is whatever the person pasted.
 */
export async function addManualSignal(formData: FormData) {
  const projectId = await getActiveProjectId();
  const platformRaw = String(formData.get("platform") || "LINKEDIN");
  const platform = isPlatform(platformRaw) ? platformRaw : "LINKEDIN";
  const url = String(formData.get("url") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const author = String(formData.get("author") || "").trim() || "unknown";
  const channel = String(formData.get("channel") || "").trim() || PLATFORM_META[platform].defaultChannel;
  const kind = String(formData.get("kind") || "POST") === "COMMENT" ? "COMMENT" : "POST";
  if (!body && !title) throw new Error("Paste the post or comment text — the scorer has nothing to read otherwise.");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("The link should start with http:// or https://");

  // Manual leads hang off a per-project monitor with no keywords, so the
  // poller never runs it but every list and filter still works.
  let monitorId = String(formData.get("monitorId") || "");
  if (!monitorId) {
    const name = "Manual signals";
    const existing = await db.monitor.findFirst({ where: { projectId, name } });
    monitorId =
      existing?.id ??
      (
        await db.monitor.create({
          data: {
            projectId,
            name,
            kind: "LEAD",
            keywords: "[]",
            subreddits: "[]",
            platforms: JSON.stringify([platform]),
            sources: "{}",
            scanComments: false,
            active: false,
          },
        })
      ).id;
  }

  const slug = (url || `${title}${body}`).replace(/[^\w]+/g, "").slice(-40) || Date.now().toString(36);
  const id = `${PLATFORM_META[platform].idPrefix || "rd_"}manual_${slug}`.slice(0, 90);

  await db.thread.upsert({
    where: { id },
    update: { title: title || body.slice(0, 120), body, author, url: url || "", permalink: url || "" },
    create: {
      id,
      platform,
      kind,
      subreddit: channel,
      title: title || body.slice(0, 120),
      body,
      author,
      permalink: url || "",
      url: url || "",
      createdUtc: new Date(),
    },
  });

  const who = await resolvePerson(projectId, platform, author);
  const lead = await db.lead.upsert({
    where: { threadId_monitorId: { threadId: id, monitorId } },
    update: { ...(who.id ? { personId: who.id } : {}) },
    create: { threadId: id, monitorId, matchedKeywords: "[]", personId: who.id },
  });

  revalidateAll();
  redirect(`/leads/${lead.id}`);
}

// ---- People and accounts ----------------------------------------------------

export async function savePerson(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing person");
  const projectId = await getActiveProjectId();
  const person = await db.person.findUniqueOrThrow({ where: { id } });
  if (person.projectId !== projectId) throw new Error("That person belongs to another project");

  const stage = String(formData.get("stage") || person.stage);
  if (!PERSON_STAGES.some((s) => s.code === stage)) throw new Error("Unknown stage");

  const accountIdRaw = String(formData.get("accountId") || "");
  const newAccount = String(formData.get("newAccount") || "").trim();
  let accountId: string | null = accountIdRaw || null;
  if (newAccount) {
    const existing = await db.account.findFirst({ where: { projectId, name: newAccount } });
    accountId =
      existing?.id ?? (await db.account.create({ data: { projectId, name: newAccount }, select: { id: true } })).id;
  }

  await db.person.update({
    where: { id },
    data: {
      displayName: String(formData.get("displayName") || "").trim() || person.displayName,
      stage,
      notes: String(formData.get("notes") || "").trim(),
      accountId,
    },
  });
  revalidatePath(`/people/${id}`);
  revalidateAll();
}

export async function setPersonStage(id: string, stage: string) {
  if (!PERSON_STAGES.some((s) => s.code === stage)) throw new Error("Unknown stage");
  const projectId = await getActiveProjectId();
  await db.person.updateMany({ where: { id, projectId }, data: { stage } });
  revalidatePath(`/people/${id}`);
  revalidateAll();
}

/** Confirm a suggested cross-platform link. Folds source into target. */
export async function confirmMerge(sourceId: string, targetId: string) {
  await mergePeople(sourceId, targetId);
  revalidateAll();
  redirect(`/people/${targetId}`);
}

/** Detach one platform identity into a person of its own — undo for a bad merge. */
export async function splitHandle(handleId: string) {
  const projectId = await getActiveProjectId();
  const handle = await db.personHandle.findUniqueOrThrow({ where: { id: handleId }, include: { person: true } });
  if (handle.projectId !== projectId) throw new Error("That handle belongs to another project");
  const siblings = await db.personHandle.count({ where: { personId: handle.personId } });
  if (siblings <= 1) throw new Error("That's their only handle — there's nothing to split off.");

  const person = await db.person.create({
    data: {
      projectId,
      displayName: handle.handle,
      stage: handle.person.stage,
      firstSeenAt: handle.firstSeenAt,
      lastSeenAt: handle.lastSeenAt,
    },
    select: { id: true },
  });
  await db.personHandle.update({ where: { id: handleId }, data: { personId: person.id, confidence: "OBSERVED" } });
  revalidateAll();
  redirect(`/people/${person.id}`);
}

/**
 * Delete everything we hold about one person: their identity rows and the link
 * from any lead to them. The public threads stay, because those are a record of
 * what was said in public, not a profile we assembled. This is what you run
 * when someone asks you to.
 */
export async function forgetPerson(id: string) {
  const projectId = await getActiveProjectId();
  const person = await db.person.findUnique({ where: { id }, select: { projectId: true } });
  if (!person || person.projectId !== projectId) throw new Error("That person belongs to another project");
  await db.lead.updateMany({ where: { personId: id }, data: { personId: null } });
  await db.personHandle.deleteMany({ where: { personId: id } });
  await db.person.delete({ where: { id } });
  revalidateAll();
  redirect("/people");
}

export async function saveAccount(formData: FormData) {
  const projectId = await getActiveProjectId();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Account name is required");
  const data = {
    name,
    domain: String(formData.get("domain") || "").trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, ""),
    segment: String(formData.get("segment") || "").trim(),
    notes: String(formData.get("notes") || "").trim(),
  };
  if (id) await db.account.update({ where: { id }, data });
  else await db.account.create({ data: { projectId, ...data } });
  revalidateAll();
}

export async function deleteAccount(id: string) {
  const projectId = await getActiveProjectId();
  await db.account.deleteMany({ where: { id, projectId } });
  revalidateAll();
}

// ---- Apify actors -----------------------------------------------------------

function actorForm(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const actorId = String(formData.get("actorId") || "").trim();
  if (!name) throw new Error("Give the actor a name you'll recognise in a monitor");
  if (!actorId) throw new Error("The Apify actor id is required, in username~actor-name form");
  const risk = actorRisk(actorId, name);
  if (risk.level === "BLOCKED") throw new Error(risk.reason);
  const riskAccepted = formData.get("riskAccepted") === "on";
  if (risk.level === "ACKNOWLEDGE" && !riskAccepted) throw new Error(risk.reason);

  const int = (k: string, d: number, min: number, max: number) => {
    const n = Number(formData.get(k));
    return Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, Math.round(n))) : d;
  };
  const json = (k: string, label: string, fallback: string) => {
    const raw = String(formData.get(k) || "").trim();
    if (!raw) return fallback;
    try {
      JSON.parse(raw);
    } catch (err) {
      throw new Error(`${label} isn't valid JSON: ${(err as Error).message}`);
    }
    return raw;
  };

  const urlPattern = String(formData.get("urlPattern") || "").trim();

  // The input template is NOT valid JSON on its own — {{keywords}} and
  // {{searchUrls}} are placeholders. Validate it the way it is actually used:
  // render it with a sample keyword, then parse. That still catches a stray
  // comma or an unquoted key, which is the whole point of validating.
  const input = String(formData.get("input") || "").trim() || "{}";
  try {
    renderInput(input, ["sample keyword"], new Date(), 10, urlPattern);
  } catch (err) {
    throw new Error(`Input template: ${(err as Error).message}`);
  }

  return {
    name,
    actorId,
    channel: String(formData.get("channel") || "").trim(),
    urlPattern,
    input,
    mapping: json("mapping", "Field mapping", JSON.stringify(DEFAULT_MAPPING)),
    cadenceHours: int("cadenceHours", 24, 1, 720),
    maxRunsPerDay: int("maxRunsPerDay", 2, 1, 48),
    maxItems: int("maxItems", 100, 1, 1000),
    timeoutSecs: int("timeoutSecs", 120, 30, 290),
    active: formData.get("active") === "on",
    riskAccepted,
  };
}

export async function saveApifyActor(formData: FormData) {
  const projectId = await getActiveProjectId();
  const id = String(formData.get("id") || "");
  const data = actorForm(formData);
  if (id) await db.apifyActor.update({ where: { id }, data });
  else await db.apifyActor.create({ data: { projectId, ...data } });
  revalidateAll();
}

export async function toggleApifyActor(id: string) {
  const a = await db.apifyActor.findUniqueOrThrow({ where: { id } });
  await db.apifyActor.update({ where: { id }, data: { active: !a.active } });
  revalidateAll();
}

export async function deleteApifyActor(id: string) {
  const projectId = await getActiveProjectId();
  await db.apifyActor.deleteMany({ where: { id, projectId } });
  revalidateAll();
}

/**
 * Run one actor now and report what came back, WITHOUT storing anything. This
 * is how you get the mapping right before a monitor starts writing rows — and
 * it still costs an Apify run, so it's a button a person presses, never
 * something the poller does.
 */
export async function testApifyActor(
  id: string,
): Promise<{ ok: boolean; message: string; sample?: { title: string; body: string; author: string; url: string; when: string }[] }> {
  if (!apifyConfigured()) return { ok: false, message: "APIFY_TOKEN is not set in .env." };
  const projectId = await getActiveProjectId();
  const a = await db.apifyActor.findUnique({ where: { id } });
  if (!a || a.projectId !== projectId) return { ok: false, message: "That actor belongs to another project." };

  const monitor = await db.monitor.findFirst({
    where: { projectId, active: true, platforms: { contains: "APIFY" } },
    select: { keywords: true },
  });
  const keywords = parseList(monitor?.keywords ?? "[]");
  const since = new Date(Date.now() - 7 * 86_400_000);

  try {
    const items = await runActor(
      {
        id: a.id,
        name: a.name,
        actorId: a.actorId,
        channel: a.channel,
        input: a.input,
        mapping: a.mapping,
        maxItems: Math.min(a.maxItems, 10),
        timeoutSecs: a.timeoutSecs,
        urlPattern: a.urlPattern,
        riskAccepted: a.riskAccepted,
      },
      keywords,
      since,
    );
    // A test stores nothing and must not push out the real run's schedule.
    await db.apifyActor.update({ where: { id }, data: { lastItems: items.length, lastError: "" } });
    revalidateAll();
    if (items.length === 0) {
      return {
        ok: false,
        message:
          "The run succeeded but nothing mapped. Either the actor returned no rows for these keywords, or the field mapping doesn't match its output shape — check the actor's example output on Apify and adjust the mapping.",
      };
    }
    return {
      ok: true,
      message: `${items.length} item${items.length === 1 ? "" : "s"} mapped cleanly.`,
      sample: items.slice(0, 3).map((i) => ({
        title: i.title.slice(0, 160),
        body: i.body.slice(0, 300),
        author: i.author,
        url: i.url,
        when: i.createdUtc.toISOString().slice(0, 16).replace("T", " "),
      })),
    };
  } catch (err) {
    const message = (err as Error).message;
    await db.apifyActor.update({ where: { id }, data: { lastError: message.slice(0, 500) } });
    revalidateAll();
    return { ok: false, message };
  }
}

// ---- Operators --------------------------------------------------------------

export async function saveOperator(formData: FormData) {
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const handleRaw = String(formData.get("handle") || "").trim();
  const handle = handleRaw.replace(/^(u\/|@)/i, "");
  const platformRaw = String(formData.get("platform") || "REDDIT");
  const platform = isPlatform(platformRaw) ? platformRaw : "REDDIT";
  if (!name) throw new Error("The person's name is required — operators are real people, not personas.");
  if (!handle) throw new Error("Account handle is required");
  const capRaw = Number(formData.get("dailyCap"));
  const warmDays = Number(formData.get("warmupDays"));
  const data = {
    name,
    handle,
    platform,
    envKey: String(formData.get("envKey") || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
    dailyCap: Number.isFinite(capRaw) && capRaw > 0 ? Math.min(20, Math.round(capRaw)) : 3,
    expertise: JSON.stringify(splitList(String(formData.get("expertise") || ""))),
    notes: String(formData.get("notes") || "").trim(),
    active: formData.get("active") === "on",
    ...(Number.isFinite(warmDays) && warmDays > 0
      ? { warmedUntil: new Date(Date.now() + Math.round(warmDays) * 86_400_000) }
      : formData.get("clearWarmup") === "on"
        ? { warmedUntil: null }
        : {}),
  };
  if (id) await db.subredditOperator.update({ where: { id }, data });
  else await db.subredditOperator.create({ data: { ...data, projectId: await getActiveProjectId() } });
  revalidateAll();
}

export async function toggleOperator(id: string) {
  const op = await db.subredditOperator.findUniqueOrThrow({ where: { id } });
  await db.subredditOperator.update({ where: { id }, data: { active: !op.active } });
  revalidateAll();
}

export async function deleteOperator(id: string) {
  const projectId = await getActiveProjectId();
  await db.subredditOperator.deleteMany({ where: { id, projectId } });
  revalidateAll();
}

export async function runOperatorCheck(id: string) {
  await checkOperatorHealth(id);
  revalidateAll();
}

export async function runAllOperatorChecks() {
  const ops = await listOperators();
  for (const o of ops) {
    try {
      await checkOperatorHealth(o.id);
    } catch {
      // checkOperatorHealth already records what it can; one bad probe
      // shouldn't stop the rest.
    }
  }
  revalidateAll();
}

// ---- Monitors --------------------------------------------------------------

export async function saveMonitor(formData: FormData) {
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const kind = String(formData.get("kind") || "LEAD") as MonitorKind;
  if (!name) throw new Error("Name is required");
  if (!MONITOR_KINDS.includes(kind)) throw new Error("Bad kind");
  const platforms = PLATFORMS.filter((p) => formData.get(`platform_${p}`) === "on");
  const sources: Partial<Record<Platform, string[]>> = {};
  for (const p of PLATFORMS) {
    if (p === "REDDIT") continue;
    const raw = String(formData.get(`scope_${p}`) || "");
    const list = splitList(raw);
    if (list.length) sources[p] = list;
  }
  const data = {
    name,
    kind,
    keywords: JSON.stringify(splitList(String(formData.get("keywords") || ""))),
    subreddits: JSON.stringify(splitList(String(formData.get("subreddits") || ""))),
    platforms: JSON.stringify(platforms.length ? platforms : ["REDDIT"]),
    sources: JSON.stringify(sources),
    scanComments: formData.get("scanComments") === "on",
    active: formData.get("active") === "on",
  };
  if (id) await db.monitor.update({ where: { id }, data });
  else await db.monitor.create({ data: { ...data, projectId: await getActiveProjectId() } });
  revalidateAll();
  redirect("/monitors");
}

export async function toggleMonitor(id: string) {
  const m = await db.monitor.findUniqueOrThrow({ where: { id } });
  await db.monitor.update({ where: { id }, data: { active: !m.active } });
  revalidateAll();
}

export async function deleteMonitor(id: string) {
  await db.monitor.delete({ where: { id } });
  revalidateAll();
  redirect("/monitors");
}

// ---- Settings --------------------------------------------------------------

export async function saveSettings(formData: FormData) {
  const num = (k: string, d: number) => {
    const n = Number(formData.get(k));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : d;
  };
  const projectId = await getActiveProjectId();
  const values = {
      brandName: String(formData.get("brandName") || "").trim(),
      productDesc: String(formData.get("productDesc") || "").trim(),
      audience: String(formData.get("audience") || "").trim(),
      voice: String(formData.get("voice") || "").trim(),
      competitors: JSON.stringify(splitList(String(formData.get("competitors") || ""))),
      alertThreshold: Math.min(100, num("alertThreshold", 70)),
      lookbackDays: Math.min(30, num("lookbackDays", 3)),
      dailyReplyCap: Math.min(100, num("dailyReplyCap", 5)),
      slackWebhook: String(formData.get("slackWebhook") || "").trim(),
  };
  await db.settings.upsert({ where: { projectId }, create: { projectId, ...values }, update: values });
  revalidateAll();
}

export async function testRedditConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const me = await getRedditClient().me();
    return { ok: true, message: `Connected as u/${me.name} (${me.commentKarma} comment karma)` };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}


// ---- Playbook --------------------------------------------------------------

export async function savePlaybook(formData: FormData) {
  const projectId = await getActiveProjectId();
  const current = parsePlaybook((await getSettings(projectId)).playbook);
  const next: PlaybookData = { ...current };
  for (const f of PLAYBOOK_FIELDS) next[f.key] = String(formData.get(f.key) ?? "").trim();
  await db.settings.upsert({
    where: { projectId },
    create: { projectId, playbook: JSON.stringify(next) },
    update: { playbook: JSON.stringify(next) },
  });
  revalidateAll();
}

export async function saveSubredditRule(formData: FormData) {
  const name = String(formData.get("name") || "").trim().replace(/^r\//i, "");
  const policy = String(formData.get("policy") || "DISCLOSE") as PolicyCode;
  const platformRaw = String(formData.get("platform") || "REDDIT");
  const platform = isPlatform(platformRaw) ? platformRaw : "REDDIT";
  if (!name) throw new Error("Channel name is required");
  if (!POLICIES[policy]) throw new Error("Bad policy");
  const data = {
    policy,
    notes: String(formData.get("notes") || "").trim(),
    verified: formData.get("verified") === "on",
  };
  const projectId = await getActiveProjectId();
  const existing = await db.subredditRule.findFirst({ where: { projectId, platform, name } });
  if (existing) await db.subredditRule.update({ where: { id: existing.id }, data });
  else await db.subredditRule.create({ data: { projectId, platform, name, ...data } });
  revalidateAll();
}

export async function deleteSubredditRule(id: string) {
  const projectId = await getActiveProjectId();
  await db.subredditRule.deleteMany({ where: { id, projectId } });
  revalidateAll();
}

/**
 * Load the packaged defaults for the ACTIVE project: playbook text, subreddit
 * rules and researched monitors. Each project has its own set (see
 * PROJECT_DEFAULTS in ./playbook); nothing from one project touches another.
 */
export async function loadProjectDefaults() {
  const project = await db.project.findUniqueOrThrow({ where: { id: await getActiveProjectId() } });
  const defaults = defaultsForSlug(project.slug);
  if (!defaults) throw new Error(`No packaged defaults for project "${project.slug}"`);
  const projectId = project.id;

  // Playbook (and, on a first load, the workspace basics the drafter reads).
  const current = await db.settings.upsert({ where: { projectId }, create: { projectId }, update: {} });
  const s = defaults.settings;
  await db.settings.update({
    where: { projectId },
    data: {
      playbook: JSON.stringify(defaults.playbook),
      ...(s?.brandName && !current.brandName ? { brandName: s.brandName } : {}),
      ...(s?.productDesc && !current.productDesc ? { productDesc: s.productDesc } : {}),
      ...(s?.audience && !current.audience ? { audience: s.audience } : {}),
      ...(s?.voice && !current.voice ? { voice: s.voice } : {}),
      ...(s?.competitors?.length && current.competitors === "[]" ? { competitors: JSON.stringify(s.competitors) } : {}),
    },
  });

  // Subreddit rules, scoped to this project.
  for (const r of defaults.subredditRules) {
    const existing = await db.subredditRule.findFirst({ where: { projectId, name: r.name } });
    if (existing) await db.subredditRule.update({ where: { id: existing.id }, data: r });
    else await db.subredditRule.create({ data: { projectId, ...r } });
  }

  // Monitors, upserted by name so edits to other monitors are untouched.
  for (const m of defaults.monitors) {
    const data = {
      kind: m.kind,
      keywords: JSON.stringify(m.keywords),
      subreddits: JSON.stringify(m.subreddits),
      scanComments: m.scanComments,
      active: true,
    };
    const existing = await db.monitor.findFirst({ where: { name: m.name, projectId } });
    if (existing) await db.monitor.update({ where: { id: existing.id }, data });
    else await db.monitor.create({ data: { name: m.name, projectId, ...data } });
  }
  revalidateAll();
}

// ---- Moderator management --------------------------------------------------

/**
 * The same gate postReply enforces, run for the composer so an operator sees the
 * block while they are still writing rather than after they press the button.
 */
export async function previewChannelGate(
  leadId: string,
  operatorId: string,
  text: string,
): Promise<GateResult | { allowed: true; findings: []; halted: false }> {
  if (!operatorId) return { allowed: true, findings: [], halted: false };
  const lead = await db.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { thread: true, monitor: true },
  });
  return channelGate({
    projectId: lead.monitor.projectId,
    platform: isPlatform(lead.thread.platform) ? lead.thread.platform : "REDDIT",
    channel: lead.thread.subreddit,
    threadId: lead.threadId,
    operatorId,
    text,
  });
}

export async function listChannelHealth() {
  return channelHealth(await getActiveProjectId());
}

export async function channelOutreachBudget() {
  return outreachBudget(await getActiveProjectId());
}

/** Everything a person learns by actually reading a subreddit's sidebar. */
export async function saveChannelStanding(formData: FormData) {
  const projectId = await getActiveProjectId();
  const id = String(formData.get("id") || "");
  const rule = await db.subredditRule.findFirstOrThrow({ where: { id, projectId } });

  const state = String(formData.get("state") || rule.state);
  if (!(state in CHANNEL_STATES)) throw new Error("Unknown channel state");

  const num = (k: string): number | null => {
    const v = String(formData.get(k) || "").trim();
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  const verified = formData.get("verified") === "on";
  const recheckDays = num("recheckDays") ?? 90;

  await db.subredditRule.update({
    where: { id: rule.id },
    data: {
      state,
      policy: (String(formData.get("policy") || rule.policy) as PolicyCode) in POLICIES ? String(formData.get("policy") || rule.policy) : rule.policy,
      rulesUrl: String(formData.get("rulesUrl") || "").trim(),
      conditions: String(formData.get("conditions") || "").trim(),
      requiredFlair: String(formData.get("requiredFlair") || "").trim(),
      promoThread: String(formData.get("promoThread") || "").trim(),
      modHandles: JSON.stringify(splitList(String(formData.get("modHandles") || "")).map((h) => h.replace(/^\/?u\//i, ""))),
      approvedUser: formData.get("approvedUser") === "on",
      linksAllowed: formData.get("linksAllowed") === "on",
      minAccountAgeDays: num("minAccountAgeDays"),
      minCommentKarma: num("minCommentKarma"),
      mentionCap30d: num("mentionCap30d") ?? rule.mentionCap30d,
      verified,
      // Verification is a moment in time, and sidebars change without telling
      // anyone. Recording who read it and when is what makes the re-read
      // reminder possible.
      verifiedAt: verified ? (rule.verified ? rule.verifiedAt : new Date()) : null,
      verifiedBy: verified ? String(formData.get("verifiedBy") || rule.verifiedBy).trim() : "",
      recheckDueAt: verified ? new Date(Date.now() + recheckDays * 86_400_000) : null,
    },
  });
  revalidateAll();
}

/**
 * Lifting a cooldown by hand, which should feel like a decision. The note is
 * kept on the incident so the reason survives the person who had it.
 */
export async function clearChannelCooldown(ruleId: string, note: string) {
  const projectId = await getActiveProjectId();
  const reason = note.trim();
  if (reason.length < 10) throw new Error("Say what changed before reopening a community that removed our comments.");
  const rule = await db.subredditRule.findFirstOrThrow({ where: { id: ruleId, projectId } });
  await db.subredditRule.update({
    where: { id: rule.id },
    data: { cooldownUntil: null, cooldownReason: "" },
  });
  await db.channelIncident.updateMany({
    where: { projectId, channel: rule.name, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedNote: reason },
  });
  revalidateAll();
}

export async function logChannelIncident(formData: FormData) {
  const projectId = await getActiveProjectId();
  const channel = String(formData.get("channel") || "").trim().replace(/^r\//i, "");
  const kind = String(formData.get("kind") || "REMOVAL") as IncidentKind;
  if (!channel) throw new Error("Which community?");
  await recordIncident({
    projectId,
    platform: String(formData.get("platform") || "REDDIT"),
    channel,
    kind,
    operatorId: String(formData.get("operatorId") || "") || null,
    detail: String(formData.get("detail") || "").trim(),
  });
  // A subreddit ban is not an event to note, it is a door closing on everyone.
  if (kind === "SUB_BAN" || kind === "MOD_WARNING") {
    const rule = await db.subredditRule.findFirst({ where: { projectId, name: channel } });
    if (rule) {
      await db.subredditRule.update({
        where: { id: rule.id },
        data: kind === "SUB_BAN" ? { state: "BANNED" } : { cooldownUntil: new Date(Date.now() + 30 * 86_400_000), cooldownReason: "A moderator warned us here." },
      });
    }
  }
  await applyCooldowns(projectId);
  revalidateAll();
}

export async function resolveChannelIncident(id: string, note: string) {
  const projectId = await getActiveProjectId();
  await db.channelIncident.updateMany({
    where: { id, projectId },
    data: { resolvedAt: new Date(), resolvedNote: note.trim() },
  });
  revalidateAll();
}

/** Draft a permission request. A person sends it; the app never messages anyone. */
export async function prepareModmail(ruleId: string) {
  const projectId = await getActiveProjectId();
  const rule = await db.subredditRule.findFirstOrThrow({ where: { id: ruleId, projectId } });
  if (rule.state === "REFUSED") {
    throw new Error(`r/${rule.name} already said no. A second ask is how a refusal turns into a ban.`);
  }
  const draft = await draftModmail(rule.id);
  const row = await db.modOutreach.create({
    data: { ruleId: rule.id, projectId, channel: rule.name, subject: draft.subject, body: draft.body },
  });
  revalidateAll();
  return { id: row.id, ...draft };
}

export async function markModmailSent(outreachId: string) {
  const projectId = await getActiveProjectId();
  const budget = await outreachBudget(projectId);
  if (budget.left <= 0) {
    throw new Error(
      `${budget.cap} permission requests a week is the cap. Reddit's spam policy names unsolicited bulk messages outright, and a burst of near-identical modmails is exactly that pattern. Next week.`,
    );
  }
  const row = await db.modOutreach.findFirstOrThrow({ where: { id: outreachId, projectId } });
  await db.modOutreach.update({ where: { id: row.id }, data: { outcome: "SENT", sentAt: new Date() } });
  await db.subredditRule.update({ where: { id: row.ruleId }, data: { state: "ASK_PENDING" } });
  revalidateAll();
}

export async function recordModmailAnswer(outreachId: string, outcome: string, answer: string) {
  const projectId = await getActiveProjectId();
  const allowed = ["APPROVED", "CONDITIONAL", "REFUSED", "NO_REPLY"];
  if (!allowed.includes(outcome)) throw new Error("Unknown outcome");
  const row = await db.modOutreach.findFirstOrThrow({ where: { id: outreachId, projectId } });
  await db.modOutreach.update({
    where: { id: row.id },
    data: { outcome, answer: answer.trim(), answeredAt: new Date() },
  });
  const nextState: Record<string, ChannelState> = {
    APPROVED: "APPROVED",
    CONDITIONAL: "CONDITIONAL",
    REFUSED: "REFUSED",
    NO_REPLY: "READ_ONLY",
  };
  await db.subredditRule.update({
    where: { id: row.ruleId },
    data: {
      state: nextState[outcome],
      ...(outcome === "CONDITIONAL" || outcome === "APPROVED" ? { conditions: answer.trim() } : {}),
    },
  });
  revalidateAll();
}
