import Anthropic from "@anthropic-ai/sdk";
import { isMock, truncate, type MonitorKind } from "./util";
import {
  POLICIES,
  SIGNALS,
  angleFor,
  marketForSlug,
  playbookForPrompt,
  playbookIsEmpty,
  signalGlossesForSlug,
  signalsForPrompt,
  type PlaybookData,
  type PolicyCode,
} from "./playbook";

/**
 * Two AI jobs:
 *  1. scoreThreads  — cheap model, batched, structured output via a forced tool call.
 *  2. draftReply    — stronger model, writes a reply in the configured voice
 *                     for a human to edit and approve. Nothing is auto-posted.
 */

export interface WorkspaceContext {
  brandName: string;
  productDesc: string;
  audience: string;
  voice: string;
  competitors: string[];
  playbook?: PlaybookData;
  /** Project.slug — selects the market framing and the signal glosses. */
  slug?: string;
}

export interface ThreadForScoring {
  id: string;
  kind?: "POST" | "COMMENT";
  subreddit: string;
  title: string;
  body: string;
  monitorKind: MonitorKind;
  monitorName: string;
}

export interface ThreadScore {
  id: string;
  relevance: number;
  intent: number;
  intentReason: string;
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED";
  summary: string;
  angle: string;
  signal: string;
}

const SCORING_MODEL = () => process.env.AI_SCORING_MODEL || "claude-haiku-4-5-20251001";
const DRAFTING_MODEL = () => process.env.AI_DRAFTING_MODEL || "claude-sonnet-5";

let _client: Anthropic | null = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY (or set MOCK_AI=1)");
  return (_client ??= new Anthropic());
}

function workspaceBlock(ctx: WorkspaceContext, forScoring = false) {
  const base = [
    `Brand: ${ctx.brandName || "(not set)"}`,
    `What we sell: ${ctx.productDesc || "(not set)"}`,
    `Who buys it: ${ctx.audience || "(not set)"}`,
    `Named competitors: ${ctx.competitors.length ? ctx.competitors.join(", ") : "(none listed)"}`,
  ].join("\n");
  if (ctx.playbook && !playbookIsEmpty(ctx.playbook)) {
    return `${base}\n\n${playbookForPrompt(ctx.playbook, { forScoring })}`;
  }
  return base;
}

const KIND_GUIDE: Record<MonitorKind, string> = {
  LEAD: `This is a LEAD monitor. "intent" = how strongly the author is actively looking for a solution our product could provide (asking for recommendations, comparing tools, describing a painful problem with budget/timeline, RFPs). Venting with no ask scores low; "what should I buy" scores high.`,
  BRAND: `This is a BRAND monitor. "relevance" = whether the thread really is about our brand (not a homonym). "intent" = how much this thread needs a response from us (a complaint, a support issue, a misconception, or a question about us = high; a neutral passing mention = low). "sentiment" is sentiment toward OUR brand.`,
  COMPETITOR: `This is a COMPETITOR monitor. "relevance" = whether it discusses one of the named competitors. "intent" = the switching opportunity: dissatisfaction with the competitor, evaluating alternatives, or pricing complaints score high. "sentiment" is sentiment toward the COMPETITOR.`,
};

/**
 * The scoring prompt is per-project, because the market changes what a strong
 * signal even looks like. "Budget approved, RFP, team size" is exactly right for
 * a platform tool and exactly wrong for someone choosing between two ₹649
 * serums, where the buying moment is one person saying "ordering tonight".
 */
function scoringSystem(ctx: WorkspaceContext): string {
  const d2c = marketForSlug(ctx.slug) === "D2C";
  const persona = d2c
    ? `You are a sharp consumer-brand community analyst triaging Reddit posts and comments for a direct-to-consumer brand. One person deciding what to buy for themselves is the whole buying committee.`
    : `You are a sharp B2B marketing analyst triaging Reddit posts and comments for a company.`;
  const markers = d2c
    ? `The strongest intent markers are an explicit ask ("what should I buy", "recommend something for…"), a shortlist of two or three named products, a stated budget, a concrete complaint about a product they already own, and imminence ("ordering tonight", "restocking"). Someone describing their skin with no question is DISCUSSION, not a lead.

Score DOWN, hard: anyone who appears to be a minor, anyone under medical treatment asking about prescription medication, and any thread where a brand replying would be intrusive rather than useful. Those are not leads however strong the words look.`
    : `Budget, timeline, team size, "we tried X", RFP, auditors and explicit tool requests are the strongest intent markers. Venting without an ask is DISCUSSION, not a lead.`;

  return `${persona} You are strict: most items are noise. Score a COMMENT on what its author says (the post title is only context). Read each item, then record a score for every id you were given using the record_scores tool. Scores are integers 0-100. Keep summaries to one sentence and "angle" to one concrete suggestion for how we could add value in a reply (or "none" if we should stay out of it).

Also classify the strongest buying signal present as one of these codes:
${signalsForPrompt(signalGlossesForSlug(ctx.slug))}

${markers}`;
}

const SCORE_TOOL: Anthropic.Tool = {
  name: "record_scores",
  description: "Record relevance, intent and sentiment for each thread.",
  input_schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            relevance: { type: "integer", minimum: 0, maximum: 100 },
            intent: { type: "integer", minimum: 0, maximum: 100 },
            intent_reason: { type: "string", description: "One sentence justifying the intent score." },
            sentiment: { type: "string", enum: ["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"] },
            summary: { type: "string" },
            angle: { type: "string" },
            signal: { type: "string", enum: SIGNALS.map((s) => s.code) },
          },
          required: ["id", "relevance", "intent", "intent_reason", "sentiment", "summary", "angle", "signal"],
        },
      },
    },
    required: ["results"],
  },
};

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

async function scoreBatchLive(threads: ThreadForScoring[], ctx: WorkspaceContext): Promise<ThreadScore[]> {
  const kind = threads[0].monitorKind;
  const list = threads
    .map((t, i) =>
      t.kind === "COMMENT"
        ? `### Item ${i + 1} (id: ${t.id}) — a COMMENT in r/${t.subreddit}\nOn the post titled: ${t.title}\nComment text: ${truncate(t.body || "(empty)", 1500)}`
        : `### Item ${i + 1} (id: ${t.id}) — a POST in r/${t.subreddit}\nTitle: ${t.title}\nBody: ${truncate(t.body || "(no body)", 1500)}`,
    )
    .join("\n\n");

  const res = await client().messages.create({
    model: SCORING_MODEL(),
    max_tokens: 4096,
    system: scoringSystem(ctx),
    tools: [SCORE_TOOL],
    tool_choice: { type: "tool", name: "record_scores" },
    messages: [
      {
        role: "user",
        content: `## Company\n${workspaceBlock(ctx, true)}\n\n## Monitor\n${KIND_GUIDE[kind]}\nMonitor name: ${threads[0].monitorName}\n\n## Threads\n${list}`,
      },
    ],
  });

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Scoring model returned no tool call");
  const raw = (block.input as { results?: unknown[] }).results ?? [];
  const byId = new Map<string, ThreadScore>();
  for (const r of raw as Record<string, unknown>[]) {
    const id = String(r.id ?? "");
    if (!id) continue;
    const s = String(r.sentiment ?? "NEUTRAL").toUpperCase();
    const sig = String(r.signal ?? "NONE").toUpperCase();
    byId.set(id, {
      id,
      relevance: clamp(r.relevance),
      intent: clamp(r.intent),
      intentReason: String(r.intent_reason ?? ""),
      sentiment: (["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"].includes(s) ? s : "NEUTRAL") as ThreadScore["sentiment"],
      summary: String(r.summary ?? ""),
      angle: String(r.angle ?? ""),
      signal: SIGNALS.some((x) => x.code === sig) ? sig : "NONE",
    });
  }
  // Anything the model skipped gets a conservative zero rather than staying unscored forever.
  return threads.map(
    (t) =>
      byId.get(t.id) ?? {
        id: t.id,
        relevance: 0,
        intent: 0,
        intentReason: "Model did not return a score.",
        sentiment: "NEUTRAL",
        summary: "",
        angle: "none",
        signal: "NONE",
      },
  );
}

// ---- Mock scoring (MOCK_AI=1): crude but deterministic --------------------

const INTENT_CUES: [RegExp, number][] = [
  [/\b(recommend|recommendations?|suggestions?)\b/i, 25],
  [/\b(looking for|need a|need an|anyone (found|used|using|knows?)|like to hear|switch tomorrow|design partner|what (are|do) (people|you|mid-size teams) us(e|ing))\b/i, 30],
  [/\b(budget|pricing|quoted|cost|pay for|happily pay|rfp|pilot|shortlist)\b/i, 20],
  [/\b(alternative|vs\.?|versus|compare|comparison)\b/i, 15],
  [/\?/, 5],
  [/\b(rant|change my mind|theatre|just sharing|not a product)\b/i, -35],
];

const NEG = /\b(absurd|annoying|flaky|out of control|nearly fell|noisy|bolted-on|rough|ghost|meaningless|duplicate|hasn't replied)\b/i;
const POS = /\b(genuinely useful|happy|positive|keeping it|strong|useful|fixed it fast|saved me)\b/i;

function scoreBatchMock(threads: ThreadForScoring[], ctx: WorkspaceContext): ThreadScore[] {
  return threads.map((t) => {
    const text = `${t.title}\n${t.body}`;
    let intent = 20;
    for (const [re, w] of INTENT_CUES) if (re.test(text)) intent += w;
    const mentionsBrand = ctx.brandName && text.toLowerCase().includes(ctx.brandName.toLowerCase());
    const mentionsCompetitor = ctx.competitors.some((c) => text.toLowerCase().includes(c.toLowerCase()));
    let relevance = 40;
    if (t.monitorKind === "BRAND") relevance = mentionsBrand ? 95 : 10;
    else if (t.monitorKind === "COMPETITOR") relevance = mentionsCompetitor ? 90 : 15;
    else relevance = /\b(ai|agents?|governance|metrics|engineering|agency|outsourc\w*|dev|token|spend)\b/i.test(text) ? 75 : 25;
    const neg = NEG.test(text);
    const pos = POS.test(text);
    const sentiment: ThreadScore["sentiment"] = neg && pos ? "MIXED" : neg ? "NEGATIVE" : pos ? "POSITIVE" : "NEUTRAL";
    if (t.monitorKind === "BRAND" && neg) intent += 30;
    if (t.monitorKind === "COMPETITOR" && neg) intent += 25;
    intent = clamp(intent);
    const signal =
      t.monitorKind === "BRAND"
        ? neg
          ? "BRAND_COMPLAINT"
          : /\?/.test(text)
            ? "BRAND_QUESTION"
            : "DISCUSSION"
        : /\b(rfp|procurement|auditors?)\b/i.test(text)
          ? "RFP_PROCUREMENT"
          : /\b(soc ?2|iso ?27001|eu ai act|audit trail|compliance|sign-?off)\b/i.test(text)
            ? "COMPLIANCE_AUDIT"
            : /\b(token|spend|bill|costs?)\b/i.test(text) && /\b(token|llm|ai|claude|cursor|copilot)\b/i.test(text)
              ? "COST_TOKEN_SPEND"
              : t.monitorKind === "COMPETITOR" && neg
                ? "COMPETITOR_DISSATISFACTION"
                : /\b(vs\.?|versus|alternative|compare|shortlist|pilot)\b/i.test(text)
                  ? "VENDOR_EVALUATION"
                  : /\b(recommend|looking for|anyone (found|using|knows?)|what (are|do) (people|you)|switch tomorrow|design partner)\b/i.test(text)
                    ? "RECOMMENDATION_REQUEST"
                    : /\b(bolted-on|noisy|absurd|doesn't (really )?understand|on the roadmap)\b/i.test(text)
                      ? "PAIN_CURRENT_TOOL"
                      : /\b(rolled out|rolling out|adopt(ed|ing)|review load)\b/i.test(text)
                        ? "AI_ROLLOUT"
                        : relevance >= 60
                          ? "DISCUSSION"
                          : "NONE";
    return {
      id: t.id,
      signal,
      relevance: clamp(relevance),
      intent,
      intentReason:
        intent >= 70
          ? "Author is explicitly asking for tools/partners and signals budget or timeline."
          : intent >= 40
            ? "Some evaluation language, but no clear ask yet."
            : "Discussion or venting with no purchase signal.",
      sentiment,
      summary: truncate((t.body || t.title).replace(/\s+/g, " "), 160),
      angle:
        intent >= 40
          ? "Answer the concrete question first, then mention how we approach it, with disclosure."
          : "none",
    };
  });
}

export async function scoreThreads(threads: ThreadForScoring[], ctx: WorkspaceContext): Promise<ThreadScore[]> {
  if (threads.length === 0) return [];
  if (isMock("AI")) return scoreBatchMock(threads, ctx);

  // Batch per monitor kind so the guide is consistent, 8 threads per call.
  const out: ThreadScore[] = [];
  const groups = new Map<MonitorKind, ThreadForScoring[]>();
  for (const t of threads) groups.set(t.monitorKind, [...(groups.get(t.monitorKind) ?? []), t]);
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 8) {
      out.push(...(await scoreBatchLive(group.slice(i, i + 8), ctx)));
    }
  }
  return out;
}

// ---- Reply drafting --------------------------------------------------------

export interface DraftInput {
  kind?: "POST" | "COMMENT";
  subreddit: string;
  title: string;
  body: string;
  monitorKind: MonitorKind;
  angle?: string | null;
  summary?: string | null;
  signal?: string | null;
  policy?: PolicyCode; // subreddit promotion policy
  policyNotes?: string;
  instructions?: string; // optional one-off steer from the human
}

const DRAFT_SYSTEM = `You write Reddit replies on behalf of a real person who works at the company described. Redditors have excellent radar for marketing, so the reply must be worth reading on its own.

Rules:
- Lead with substance: actually answer the question or address the point, with specifics from experience. Be concrete, not generic.
- Only mention our product if it is directly useful to the author. When you do, disclose plainly in the first person ("I work on X" / "disclosure: I'm on the team at X"). Never pose as a neutral bystander.
- Match the subreddit's register. No marketing language, no exclamation marks, no bullet-point brochures, no emoji.
- No links unless the author asked for one.
- If the thread is a complaint about us: acknowledge it, own it, offer a concrete next step. Do not get defensive.
- If the thread is about a competitor: be fair to them. Differentiate on what we do differently, not on trashing them.
- 60–170 words. Plain text with light Reddit markdown at most. Output only the reply, nothing else.`;

export async function draftReply(input: DraftInput, ctx: WorkspaceContext): Promise<string> {
  if (isMock("AI")) return draftReplyMock(input, ctx);

  const policy = input.policy && POLICIES[input.policy] ? input.policy : "DISCLOSE";
  const playbookAngle = ctx.playbook ? angleFor(ctx.playbook, input.signal) : null;
  const res = await client().messages.create({
    model: DRAFTING_MODEL(),
    max_tokens: 1024,
    system: DRAFT_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          `## Company\n${workspaceBlock(ctx)}`,
          `## Voice\n${ctx.voice || "Direct, practical, a little dry. Talks like a senior engineer, not a marketer."}`,
          `## Subreddit policy for r/${input.subreddit} (${POLICIES[policy].label})\n${POLICIES[policy].rule}${input.policyNotes ? `\nNotes: ${input.policyNotes}` : ""}`,
          input.signal ? `## Buying signal\n${input.signal}${playbookAngle ? `\nPlaybook angle: ${playbookAngle}` : ""}` : "",
          input.kind === "COMMENT"
            ? `## Comment you are replying to — r/${input.subreddit} (${input.monitorKind} monitor)\nOn the post: ${input.title}\n\nThe comment:\n${truncate(input.body || "(empty)", 4000)}\n\nReply to the commenter directly, not to the original post.`
            : `## Thread — r/${input.subreddit} (${input.monitorKind} monitor)\nTitle: ${input.title}\n\n${truncate(input.body || "(no body)", 4000)}`,
          input.summary ? `## Analyst summary\n${input.summary}` : "",
          input.angle && input.angle !== "none" ? `## Suggested angle\n${input.angle}` : "",
          input.instructions ? `## Extra instructions from the human\n${input.instructions}` : "",
          `Write the reply now.`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  if (!text) throw new Error("Drafting model returned no text");
  return text;
}

function draftReplyMock(input: DraftInput, ctx: WorkspaceContext): string {
  const brand = ctx.brandName || "our product";
  if (input.policy === "NO_PROMO" || input.policy === "VALUE_ONLY") {
    return `Two things that helped us more than any tool: label every PR by origin (agent vs human) at the CI step so every downstream metric can be split, and go back through last quarter's incidents and tag which ones touched agent-written code. The second one usually ends the "is AI helping" argument in about an hour. If you do build the labelling in-house, keep the sign-off record out of PR comments and in something queryable — auditors will ask for it later.${
      input.instructions ? `\n\n(${input.instructions})` : ""
    }`;
  }
  if (input.monitorKind === "BRAND") {
    return `Hey — I'm on the team at ${brand}, so take this with that in mind. Thanks for writing this up rather than just churning. ${
      /duplicate|bug|flaky|hasn't replied/i.test(input.body)
        ? "That behaviour isn't expected and I'd like to get it fixed properly. If you DM me the workspace name I'll get someone on it today and follow up here with what we found."
        : "Glad the weekly summary is earning its keep. If there's anything you wish it did differently, I'd rather hear it here than not at all."
    }`;
  }
  if (input.monitorKind === "COMPETITOR") {
    return `Fair points on both. The thing most of these tools get wrong is that they measure activity (suggestions accepted, PRs merged) rather than whether agent-written changes were actually safe to ship. What I'd look for: can it trace a change from ticket to agent to PR to deploy with the human sign-off recorded, and can it attribute token spend to a team. Disclosure: I work on ${brand}, which is built around exactly that gap, but honestly the traceability question is worth asking whichever vendor you pick.${input.instructions ? `\n\n(${input.instructions})` : ""}`;
  }
  return `Been through this at a couple of orgs. Two things helped more than any dashboard: (1) label PRs by origin (agent vs human) at the CI level so every downstream metric can be split, and (2) review incidents for the last quarter and tag which ones touched agent-written code — that number usually settles the "is AI helping" argument fast.

For tooling: disclosure, I work on ${brand}. It sits above GitHub/Jira/Slack and does the origin-tagging and sign-off trail out of the box, which is the part most engineering-metrics tools bolt on badly. Happy to compare notes on what you're seeing even if you end up building in-house.${input.instructions ? `\n\n(${input.instructions})` : ""}`;
}
