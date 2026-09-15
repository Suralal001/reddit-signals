/**
 * The playbook is the substance the AI reasons from: what the product is, what
 * it may and may not say, which buying signals matter, and how each subreddit
 * treats promotion. Stored as JSON in Settings.playbook; edited on /playbook.
 *
 * Everything below is the DryDock AI default, assembled from usedrydock.com,
 * the competitive research already done for the brand, and published data on
 * what works on Reddit for B2B tools. Edit freely in the UI.
 *
 * The per-project registry at the bottom is kept even though this deployment
 * ships one brand: the scoring prompt, the seed and the "Load defaults" button
 * all read from it, and collapsing it would mean rewriting three call sites to
 * save one object key.
 */

export interface PlaybookData {
  positioning: string;
  pillars: string;
  proofPoints: string;
  differentiators: string;
  objections: string;
  disclosure: string;
  doNotSay: string;
  ctaPolicy: string;
  angles: string;
}

export const PLAYBOOK_FIELDS: { key: keyof PlaybookData; label: string; hint: string; rows: number }[] = [
  { key: "positioning", label: "Positioning", hint: "One paragraph the AI can paraphrase. What it is, for whom, instead of what.", rows: 4 },
  { key: "pillars", label: "Pillars", hint: "The 3–4 things you want to be known for. One per line.", rows: 5 },
  { key: "proofPoints", label: "Proof points", hint: "Only claims you can stand behind. The AI is forbidden from inventing numbers or customers.", rows: 6 },
  { key: "differentiators", label: "Differentiators", hint: "How you differ from each competitor category. Be fair to them; Reddit checks.", rows: 8 },
  { key: "objections", label: "Objections", hint: "Objection → honest answer. One per line.", rows: 8 },
  { key: "disclosure", label: "Disclosure line", hint: "Exact wording used whenever the product is mentioned.", rows: 2 },
  { key: "doNotSay", label: "Do not say", hint: "Hard rules. The lint blocks some of these before posting.", rows: 6 },
  { key: "ctaPolicy", label: "Links & next steps", hint: "When (if ever) to offer a link, demo, or DM.", rows: 4 },
  { key: "angles", label: "Reply angles by signal", hint: "For each buying signal, the shape of a good reply.", rows: 12 },
];

// ---- Buying-signal taxonomy --------------------------------------------------

/**
 * Codes are global — they are stored on Lead.signal, filtered on /leads and
 * charted in the signal mix, so they must be stable across projects. Labels are
 * deliberately market-neutral: the same code has to read correctly for a B2B
 * platform tool and for a D2C skincare brand. What *changes* per project is the
 * description the scorer reads, via `signalGlosses` on ProjectDefaults — see
 * PROJECTSKIN_SIGNAL_GLOSSES for the consumer reading of the same taxonomy.
 */
export const SIGNALS = [
  { code: "RECOMMENDATION_REQUEST", label: "Asking for recommendations", hot: true, desc: `"what are you using for…", "recommend a tool", "anyone found something that…"` },
  { code: "VENDOR_EVALUATION", label: "Comparing options", hot: true, desc: `"X vs Y", "alternative to X", shortlist, pilot, POC, "we tried X and…"` },
  { code: "RFP_PROCUREMENT", label: "Ready to buy", hot: true, desc: `RFP, RFI, procurement, budget approved, "need something by Q…", auditors/board asked` },
  { code: "COMPLIANCE_AUDIT", label: "Safety & compliance", hot: true, desc: `SOC 2, ISO 27001, EU AI Act, audit trail, "prove AI code was reviewed", sign-off records` },
  { code: "COST_TOKEN_SPEND", label: "Price sensitivity", hot: true, desc: `token spend, LLM bill, Cursor/Copilot/Claude seats, cost attribution per team` },
  { code: "PAIN_CURRENT_TOOL", label: "Pain with what they use now", hot: false, desc: `LinearB/Jellyfish/DX/Faros "doesn't understand agent PRs", "bolted-on", "noisy", pricing complaints` },
  { code: "AI_ROLLOUT", label: "Adoption in progress", hot: false, desc: `adopting Cursor/Claude Code/Copilot org-wide, review load rising, incidents, "how do you govern"` },
  { code: "COMPETITOR_DISSATISFACTION", label: "Unhappy with a competitor", hot: true, desc: `explicit frustration with a named competitor, churn intent` },
  { code: "BRAND_QUESTION", label: "Question about us", hot: true, desc: `asks how our product works, what's in it, pricing, integrations, a comparison involving us` },
  { code: "BRAND_COMPLAINT", label: "Complaint about us", hot: true, desc: `bug, order, billing, support, a misconception about us` },
  { code: "DISCUSSION", label: "General discussion", hot: false, desc: `on-topic but no ask; credibility-building only` },
  { code: "NONE", label: "Not relevant", hot: false, desc: `off-topic or homonym` },
] as const;

export type SignalCode = (typeof SIGNALS)[number]["code"];

/** Per-project rewording of what each code means. Codes and labels stay global. */
export type SignalGlosses = Partial<Record<SignalCode, string>>;

export function signalLabel(code: string | null | undefined): string {
  return SIGNALS.find((s) => s.code === code)?.label ?? "—";
}

export function signalIsHot(code: string | null | undefined): boolean {
  return Boolean(SIGNALS.find((s) => s.code === code)?.hot);
}

export function signalsForPrompt(glosses?: SignalGlosses): string {
  return SIGNALS.map((s) => `- ${s.code} (${s.label}): ${glosses?.[s.code] ?? s.desc}`).join("\n");
}

// ---- Subreddit policies --------------------------------------------------------

export const POLICIES = {
  OPEN: {
    label: "Open",
    short: "Product mentions fine with disclosure; a relevant link is acceptable.",
    rule: "You may name the product when relevant, with the disclosure line. A single relevant link is acceptable if the author asked for one.",
  },
  DISCLOSE: {
    label: "Disclose",
    short: "Mention allowed only with disclosure at the top; no links unless asked.",
    rule: "Name the product only if it directly answers the author's need, and put the disclosure line in the first sentence. No links unless the author explicitly asked for one.",
  },
  VALUE_ONLY: {
    label: "Value only",
    short: "Answer the question; name the product only if the author explicitly asked for tools.",
    rule: "Answer fully without naming the product. Only if the author explicitly asked for tool recommendations may you name it, with disclosure, in one sentence at the end. No links.",
  },
  NO_PROMO: {
    label: "No promo",
    short: "Never mention the product here. Help, build credibility, or skip.",
    rule: "Do not mention the product, the company, or any link. Give a useful answer from experience, or return the single word SKIP if a good reply would require mentioning it.",
  },
} as const;

export type PolicyCode = keyof typeof POLICIES;

export const DEFAULT_POLICY: PolicyCode = "DISCLOSE";

export interface SubredditRuleSeed {
  name: string;
  policy: PolicyCode;
  notes: string;
  verified: boolean;
}

/**
 * Verified rows were checked against a published summary of the subreddit's
 * rules; unverified rows are conservative defaults — confirm against the
 * sidebar before the first reply there.
 */
export const DRYDOCK_SUBREDDIT_RULES: SubredditRuleSeed[] = [
  { name: "devops", policy: "DISCLOSE", verified: true, notes: "Rule: self promotion goes in the weekly self-promotion thread; any affiliation must be fully disclosed at the TOP of the comment. Answer-first replies with disclosure are tolerated; standalone promo is removed." },
  { name: "ExperiencedDevs", policy: "VALUE_ONLY", verified: true, notes: "Rule: no surveys/advertisements. Product mentions survive only when they directly answer a question; the crowd is allergic to vendor tone. Lead with experience, name the product only if asked." },
  { name: "startups", policy: "DISCLOSE", verified: true, notes: "Rule: no direct sales/ads/promotional posts; designated promo threads exist. Comments that answer a resource request with disclosure are fine." },
  { name: "programming", policy: "NO_PROMO", verified: true, notes: "Rule: not the place to promote a project. Comments only, technical substance only, never name the product." },
  { name: "EngineeringManagers", policy: "VALUE_ONLY", verified: false, notes: "Vendor content is removed on sight; the audience is exactly ICP, so this is the sub where credibility matters most. Answer as a peer EM. Name the product only when explicitly asked which tools exist." },
  { name: "PlatformEngineering", policy: "DISCLOSE", verified: false, notes: "Tool talk is normal; disclose affiliation up front." },
  { name: "sre", policy: "VALUE_ONLY", verified: false, notes: "Low tolerance for vendors. Incident/audit-trail angles resonate; keep product out unless asked." },
  { name: "softwarearchitecture", policy: "VALUE_ONLY", verified: false, notes: "Discussion-oriented. Governance-as-architecture angle works; no product names unless asked." },
  { name: "cto", policy: "DISCLOSE", verified: false, notes: "Small, senior audience. Disclosure + peer tone." },
  { name: "ClaudeAI", policy: "DISCLOSE", verified: false, notes: "Tool-friendly community; token-cost and Claude Code governance threads are common. Disclose, don't spam." },
  { name: "cursor", policy: "DISCLOSE", verified: false, notes: "Tool-friendly; cost and PR-quality threads are frequent. Disclose." },
  { name: "ChatGPTCoding", policy: "DISCLOSE", verified: false, notes: "Tool-friendly; disclose." },
  { name: "GithubCopilot", policy: "DISCLOSE", verified: false, notes: "Copilot PR quality / review-load threads. Disclose." },
  { name: "AI_Agents", policy: "DISCLOSE", verified: false, notes: "Agent governance discussions; disclose, avoid link drops." },
  { name: "LLMDevs", policy: "DISCLOSE", verified: false, notes: "Cost attribution and eval threads; disclose." },
  { name: "SaaS", policy: "DISCLOSE", verified: false, notes: "Promo-tolerant with disclosure, but low ICP density." },
  { name: "agile", policy: "VALUE_ONLY", verified: false, notes: "Process-focused; governance/flow angle only." },
  { name: "cscareerquestions", policy: "NO_PROMO", verified: false, notes: "Not a buying audience; never promote." },
];

// ---- Researched monitors --------------------------------------------------------

export interface MonitorSeed {
  name: string;
  kind: "LEAD" | "BRAND" | "COMPETITOR";
  keywords: string[];
  subreddits: string[];
  scanComments: boolean;
}

const ICP_SUBS = ["EngineeringManagers", "ExperiencedDevs", "devops", "PlatformEngineering", "sre", "softwarearchitecture", "cto"];
const AI_TOOL_SUBS = ["ClaudeAI", "cursor", "ChatGPTCoding", "GithubCopilot", "AI_Agents", "LLMDevs"];

export const DRYDOCK_MONITORS: MonitorSeed[] = [
  {
    name: "T1 — AI code governance",
    kind: "LEAD",
    keywords: [
      "AI generated code",
      "AI code review",
      "code review bottleneck",
      "agent generated PR",
      "AI code quality",
      "who reviewed the code",
      "AI code accountability",
      "governing AI agents",
      "AI delivery governance",
      "policy gate",
      "human sign-off",
      "AI code risk",
    ],
    subreddits: [...ICP_SUBS, ...AI_TOOL_SUBS],
    scanComments: true,
  },
  {
    name: "T1 — AI coding spend",
    kind: "LEAD",
    keywords: [
      "Copilot ROI",
      "Copilot cost",
      "Copilot billing",
      "Copilot credits",
      "Cursor cost",
      "Claude Code cost",
      "token spend",
      "LLM cost",
      "cost attribution",
      "AI tooling budget",
      "AI spend",
    ],
    subreddits: ["ClaudeAI", "cursor", "ChatGPTCoding", "GithubCopilot", "AI_Agents", "LLMDevs", "EngineeringManagers", "cto", "devops"],
    scanComments: true,
  },
  {
    name: "T1 — Tool requests & evaluations",
    kind: "LEAD",
    keywords: [
      "engineering intelligence",
      "DORA metrics tool",
      "developer productivity platform",
      "LinearB alternative",
      "Jellyfish alternative",
      "Faros alternative",
      "AI code review tool",
      "code review tool",
      "engineering metrics tool",
      "release readiness",
    ],
    subreddits: ICP_SUBS,
    scanComments: true,
  },
  {
    name: "T2 — Delivery pain & AI rework",
    kind: "LEAD",
    keywords: [
      "code review overwhelmed",
      "review queue",
      "AI code bugs",
      "AI rework",
      "AI productivity paradox",
      "velocity vs quality",
      "production incident",
      "measuring AI impact",
      "prove AI is working",
      "AI adoption challenges",
      "developer productivity",
    ],
    subreddits: [...ICP_SUBS, ...AI_TOOL_SUBS],
    scanComments: true,
  },
  {
    name: "T3 — Engineering leadership audience",
    kind: "LEAD",
    keywords: [
      "DORA metrics",
      "platform engineering",
      "developer experience",
      "engineering leadership",
      "AI coding agents",
      "agentic development",
      "AI native development",
      "engineering productivity",
    ],
    subreddits: ICP_SUBS,
    scanComments: false,
  },
  {
    name: "T4 — Competitor & category watch",
    kind: "COMPETITOR",
    keywords: [
      "LinearB",
      "Jellyfish",
      "CodeRabbit",
      "Qodo",
      "Faros",
      "Swarmia",
      "getdx",
      "Plandek",
      "Graphite code review",
      "engineering intelligence platform",
      "Exceeds.ai",
      "Kovil",
    ],
    subreddits: [...ICP_SUBS, ...AI_TOOL_SUBS],
    scanComments: true,
  },
  {
    name: "T5 — Compliance & policy triggers",
    kind: "LEAD",
    keywords: [
      "EU AI Act",
      "SOC 2",
      "audit trail",
      "AI compliance",
      "shadow AI",
      "AI tool sprawl",
      "Copilot enterprise",
      "AI policy",
      "AI governance policy",
    ],
    subreddits: ["EngineeringManagers", "ExperiencedDevs", "devops", "PlatformEngineering", "sre", "softwarearchitecture", "cto", "cybersecurity", "sysadmin"],
    scanComments: true,
  },
  {
    name: "Governance-gap phrases (comments)",
    kind: "LEAD",
    keywords: [
      "who reviewed",
      "who signed off",
      "how do we enforce",
      "who is governing",
      "who's accountable",
      "nobody reviews",
      "rubber stamp",
      "who approved",
    ],
    subreddits: [...ICP_SUBS, ...AI_TOOL_SUBS],
    scanComments: true,
  },
  {
    name: "DryDock brand mentions",
    kind: "BRAND",
    keywords: [
      "DryDock AI",
      "DryDock",
      "usedrydock",
      "Dockmaster",
    ],
    subreddits: [],
    scanComments: true,
  },
];

// ---- DryDock playbook content ------------------------------------------------------

export const DRYDOCK_PLAYBOOK: PlaybookData = {
  positioning: `DryDock AI is an AI delivery governance platform. It sits above the tools an engineering org already runs (GitHub/GitLab, Jira/Linear, CI like Jenkins, observability like Datadog/Grafana/Sentry, Slack, and the AI coding tools — Claude Code, Cursor, Copilot) and governs what AI-assisted teams ship: every AI-assisted change is tagged, policy-gated and reviewable; most changes clear automatically; the few that trip a policy are routed to a human with the evidence attached; every approval is logged as audit evidence. Dockmaster AI is the orchestrator that reads across the stack and answers leadership questions in plain language with evidence. It is for engineering leaders (VP Eng, CTO, Director, EM, platform leads) at companies shipping AI-assisted code at scale, especially where SOC 2 / ISO / EU AI Act style evidence is required. It is not a code-review bot and not another DORA dashboard; it is the governance and intelligence layer those feed into.`,

  pillars: `Leadership single source of truth — one honest picture of delivery across Jira/GitHub/CI/observability, in plain language, with evidence attached (Dockmaster).
Governed AI and agentic delivery — policy gates on AI-generated changes; human sign-off recorded; escalations arrive decision-ready.
Token economics intelligence — attribute AI/LLM spend to teams, repos and outcomes so finance and engineering argue from the same numbers.
Compliance by default — audit evidence generated as a by-product of shipping, not assembled before an audit.`,

  proofPoints: `Site claims (use verbatim, never embellish): "85% of enterprises are piloting AI agents; only 5% have shipped them to production."
Illustrative flow from the site: in a typical window, 214 changes shipped, 209 cleared automatically, 5 routed to humans.
Integrations live: GitHub, GitLab, Jira, Linear, Jenkins, Grafana, Prometheus, Datadog, Sentry, PagerDuty, Claude, Cursor, Copilot, Slack.
Setup: GitHub connection in minutes; early-cohort pricing is discounted and locked in for early customers (details on an intro call — do not quote numbers).
Team: built by an engineering org (Neoito) that runs AI-assisted delivery for its own clients; the product came out of governing that.
If asked for customer names or metrics you don't have: say it's an early-cohort product and offer to share what you can 1:1. Never invent logos, percentages or benchmarks.`,

  differentiators: `vs AI code review (CodeRabbit, Qodo): they review a diff; DryDock governs the whole change path — who/what wrote it, whether it passed policy, who signed off, and the audit record. Complementary, not a replacement; DryDock can consume their signals.
vs engineering intelligence / DORA (LinearB, Jellyfish, Faros, DX, Swarmia): they measure throughput and developer experience; most treat agent-written PRs like human ones. DryDock splits everything by origin (agent vs human), enforces gates, and produces evidence — the "why" behind the numbers, not just the four charts.
vs building in-house (GitHub Actions + labels + spreadsheets): works for tagging, doesn't scale to sign-off records, cost attribution or audit packs; DryDock is that in-house project productised, with a no-code trigger/condition/action framework for custom policies.
vs "just use Cursor/Copilot analytics": those report usage of one tool; DryDock reads across all AI tools plus the delivery system.
Fairness rule: name what a competitor does well before what it lacks. Reddit rewards that and punishes trashing.`,

  objections: `"Isn't this just another DORA dashboard?" → DORA is the baseline; the point is splitting every metric by agent vs human origin and attaching policy + sign-off evidence. Dashboards describe; governance decides.
"We'll build it ourselves." → Fair, and a GitHub Action that labels agent PRs is a great start (say so). The expensive parts are sign-off trails, cost attribution and audit packs, which is where in-house efforts stall.
"Our devs will hate more gates." → Most changes clear automatically; only policy-flagged ones reach a human. The goal is fewer surprise reviews, not more process.
"Compliance is a checkbox for us." → Then generate the evidence as a by-product of shipping and stop assembling it before audits. EU AI Act and SOC 2 reviewers increasingly ask specifically about AI-generated code.
"Pricing?" → Early-cohort pricing, discounted and locked in; specifics on a call. Do not quote figures on Reddit.
"Is it mature?" → Be honest: early cohort. That's why the pricing is what it is and why design-partner feedback shapes the roadmap.`,

  disclosure: `Disclosure: I work on DryDock AI, so weigh that accordingly.`,

  doNotSay: `Never invent customers, logos, metrics, benchmarks or "studies".
Never quote prices or discounts.
Never claim SOC 2 / ISO / EU AI Act "compliance" for the customer — DryDock produces evidence; auditors decide.
Never trash a competitor; acknowledge what they do well.
Never post a link unless the author asked for one and the subreddit allows it.
Never use marketing phrases: "game-changer", "seamless", "revolutionary", "unlock", "supercharge", "cutting-edge", exclamation marks, emoji.
Never mention DryDock in a subreddit whose policy is NO_PROMO, or in a VALUE_ONLY subreddit unless the author explicitly asked for tools.
Never DM people who didn't ask to be DMed.
Never reply to the same thread twice with product mentions.`,

  ctaPolicy: `Default: no link, no CTA. The reply should be complete on its own.
If the author explicitly asks "where can I find it / link?": reply with usedrydock.com once, no tracking parameters.
If the author asks for a demo or pricing: "Happy to walk you through it — DM me or the site has an intro-call link." One sentence, at the end.
Design-partner asks (e.g. "happy to be a design partner"): acknowledge directly and invite a DM; this is the highest-value signal we see.
Everything else: end on a useful thought or a question about their setup, not a pitch.`,

  angles: `RECOMMENDATION_REQUEST → Answer the actual question with 2–3 concrete options including at least one non-DryDock option; then, if the sub allows, one sentence on where DryDock fits and why, with disclosure.
VENDOR_EVALUATION → Give a fair read on the tools named (what each is good at), then the question they should ask any vendor: "can it split metrics by agent vs human origin and show the sign-off trail?" Mention DryDock only as one answer to that question.
RFP_PROCUREMENT → Be brief and specific: what to put in the RFP (origin tagging, policy gates, sign-off evidence, cost attribution, integrations). Offer to share an RFP checklist by DM. Disclose.
COMPLIANCE_AUDIT → Explain what auditors actually ask for regarding AI-generated code (traceability, review evidence, human accountability). Practical first, product second.
COST_TOKEN_SPEND → Give a workable attribution approach they can do today (tag by team/repo, per-seat vs per-token, monthly review), then note that DryDock does this across tools if they'd rather not build it.
PAIN_CURRENT_TOOL → Validate the specific pain, suggest a workaround inside their current tool if one exists, then explain the structural reason the tool can't do it and what a different category looks like.
AI_ROLLOUT → Share the two practices that help most (origin-label every PR at CI; review last quarter's incidents by origin). Product mention optional and only with disclosure.
COMPETITOR_DISSATISFACTION → Be scrupulously fair to the competitor. Ask what they need that it doesn't do; answer that. Disclose if DryDock is mentioned.
BRAND_QUESTION → Answer plainly and completely; no selling; invite follow-up.
BRAND_COMPLAINT → Own it, no defensiveness, concrete next step, offer to fix it publicly. Never argue.
DISCUSSION → Contribute experience; no product mention. This is how the account earns the right to be heard later.
NONE → Skip.`,
};

// ---- Per-project defaults registry -------------------------------------------------

export interface ProjectDefaults {
  playbook: PlaybookData;
  subredditRules: SubredditRuleSeed[];
  monitors: MonitorSeed[];
  settings?: {
    brandName?: string;
    productDesc?: string;
    audience?: string;
    voice?: string;
    competitors?: string[];
    /** The domain whose links are budgeted across every community at once. */
    brandDomain?: string;
  };
  /**
   * B2B is the default. D2C swaps the scorer's persona and its intent markers —
   * "budget approved, RFP, team size" is the wrong thing to look for when the
   * buyer is one person deciding between two ₹649 serums.
   */
  market?: "B2B" | "D2C";
  /** Per-project rewording of the signal taxonomy for the scoring prompt. */
  signalGlosses?: SignalGlosses;
}

/** Keyed by Project.slug. A project with no entry here gets no "Load defaults" button. */
export const PROJECT_DEFAULTS: Record<string, ProjectDefaults> = {
  drydock: {
    playbook: DRYDOCK_PLAYBOOK,
    subredditRules: DRYDOCK_SUBREDDIT_RULES,
    monitors: DRYDOCK_MONITORS,
    market: "B2B",
    settings: {
      brandName: "DryDock AI",
      productDesc:
        "DryDock AI is an AI delivery governance platform: an intelligence and governance layer above Jira, GitHub, Slack and CI/CD, orchestrated by Dockmaster AI. It answers who governs AI-written code, what it costs, and where delivery is actually stuck.",
      audience:
        "Engineering leaders — VPs of Engineering, CTOs, heads of platform and delivery — at companies rolling out AI coding agents org-wide and discovering that their delivery metrics no longer mean anything.",
      voice:
        "Practitioner, not marketer. Answer the question first and completely; be fair about competitors by name; admit what is early or unproven; no hype words, no exclamation marks, no emoji; disclose affiliation whenever the product is named.",
      competitors: ["LinearB", "Jellyfish", "DX", "Faros.ai", "CodeRabbit", "Qodo", "Exceeds.ai", "Kovil.ai"],
      brandDomain: "usedrydock.com",
    },
  },
};

/** B2B unless a project says otherwise. */
export function marketForSlug(slug: string | null | undefined): "B2B" | "D2C" {
  return (slug && PROJECT_DEFAULTS[slug]?.market) || "B2B";
}

export function signalGlossesForSlug(slug: string | null | undefined): SignalGlosses | undefined {
  return slug ? PROJECT_DEFAULTS[slug]?.signalGlosses : undefined;
}

export function defaultsForSlug(slug: string): ProjectDefaults | null {
  return PROJECT_DEFAULTS[slug] ?? null;
}

// ---- Helpers ----------------------------------------------------------------------

export function parsePlaybook(raw: string | null | undefined): PlaybookData {
  const empty: PlaybookData = {
    positioning: "",
    pillars: "",
    proofPoints: "",
    differentiators: "",
    objections: "",
    disclosure: "",
    doNotSay: "",
    ctaPolicy: "",
    angles: "",
  };
  if (!raw) return empty;
  try {
    const v = JSON.parse(raw) as Partial<PlaybookData>;
    return { ...empty, ...Object.fromEntries(Object.entries(v).filter(([, val]) => typeof val === "string")) } as PlaybookData;
  } catch {
    return empty;
  }
}

export function playbookIsEmpty(p: PlaybookData): boolean {
  return !p.positioning && !p.pillars && !p.disclosure;
}

/** Pull the angle line for one signal out of the free-text angles block. */
export function angleFor(p: PlaybookData, signal: string | null | undefined): string | null {
  if (!signal) return null;
  const line = p.angles.split("\n").find((l) => l.trim().toUpperCase().startsWith(signal.toUpperCase()));
  if (!line) return null;
  return line.replace(/^[A-Z_]+\s*(→|->|:)\s*/i, "").trim();
}

/** Compact rendering for prompts. */
export function playbookForPrompt(p: PlaybookData, opts: { forScoring?: boolean } = {}): string {
  if (opts.forScoring) {
    return [`## Positioning\n${p.positioning}`, `## Pillars\n${p.pillars}`, `## Differentiators\n${p.differentiators}`].join("\n\n");
  }
  return [
    `## Positioning\n${p.positioning}`,
    `## Pillars\n${p.pillars}`,
    `## Proof points you may use (nothing else)\n${p.proofPoints}`,
    `## Differentiators\n${p.differentiators}`,
    `## Objection handling\n${p.objections}`,
    `## Disclosure line (verbatim when the product is named)\n${p.disclosure}`,
    `## Hard rules\n${p.doNotSay}`,
    `## Links & next steps\n${p.ctaPolicy}`,
  ].join("\n\n");
}
