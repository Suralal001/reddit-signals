import { POLICIES, type PolicyCode } from "./playbook";

/**
 * Pre-post lint. Pure function so it runs in the browser (live feedback in the
 * composer) and on the server (hard enforcement in postReply). Blocks are the
 * things that get accounts banned or brands auto-filtered; warns are taste.
 */

export interface LintIssue {
  level: "block" | "warn";
  code: string;
  message: string;
}

export interface LintContext {
  brandName: string;
  brandAliases?: string[];
  competitors: string[];
  policy: PolicyCode;
  authorAskedForTools?: boolean; // VALUE_ONLY subs: mention allowed only then
}

const DISCLOSURE_RE =
  /\b(disclosure|full disclosure|disclaimer|i (work|am|'m) (on|at|for|with) |i work on|i'm on the team|i'm the founder|i founded|we build|we make|my company|our product|our team builds|i build|i help build|i'm (a |the )?(co-?)?founder)\b/i;
const URL_RE = /\b(https?:\/\/|www\.)[^\s)]+/i;
const MARKETING_RE =
  /\b(game[- ]?changer|seamless(ly)?|revolutionary|unlock|supercharge|cutting[- ]edge|best[- ]in[- ]class|world[- ]class|next[- ]gen(eration)?|10x|effortless(ly)?)\b/i;
const NEG_RE = /\b(garbage|trash|useless|scam|joke|terrible|awful|worst|rip[- ]?off|clueless|dumpster fire)\b/i;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function mentionsBrand(text: string, ctx: Pick<LintContext, "brandName" | "brandAliases">): boolean {
  const names = [ctx.brandName, ...(ctx.brandAliases ?? [])].filter((n) => n && n.length > 2);
  return names.some((n) => new RegExp(`\\b${escapeRe(n)}\\b`, "i").test(text));
}

export function lintReply(text: string, ctx: LintContext): LintIssue[] {
  const issues: LintIssue[] = [];
  const t = text.trim();
  if (!t) return issues;

  const brand = mentionsBrand(t, ctx);
  const hasUrl = URL_RE.test(t);
  const words = t.split(/\s+/).length;
  const policy = POLICIES[ctx.policy] ? ctx.policy : "DISCLOSE";

  // --- product mention vs subreddit policy ---
  if (brand && policy === "NO_PROMO") {
    issues.push({ level: "block", code: "no-promo", message: "This subreddit doesn't allow product mentions. Remove the product name or skip the thread." });
  }
  if (brand && policy === "VALUE_ONLY" && !ctx.authorAskedForTools) {
    issues.push({ level: "block", code: "value-only", message: "Value-only subreddit: name the product only when the author explicitly asked for tools. Tick “author asked for tools” if they did." });
  }

  // --- disclosure ---
  if (brand && !DISCLOSURE_RE.test(t)) {
    issues.push({ level: "block", code: "disclosure", message: "You name the product but don't disclose that you work on it. Add the disclosure line." });
  } else if (brand && policy === "DISCLOSE") {
    const firstChunk = t.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    if (!DISCLOSURE_RE.test(firstChunk)) {
      issues.push({ level: "warn", code: "disclosure-position", message: "This subreddit expects the disclosure at the top of the comment. Move it into the first sentence or two." });
    }
  }

  // --- links ---
  if (hasUrl && policy !== "OPEN") {
    issues.push({ level: "block", code: "link", message: "Links get comments auto-removed here unless the author asked. Remove the URL; offer it only if they ask." });
  } else if (hasUrl) {
    issues.push({ level: "warn", code: "link-open", message: "A link is allowed here, but make sure the author actually asked for one." });
  }

  // --- length ---
  if (words > 220) issues.push({ level: "warn", code: "long", message: `${words} words — Reddit replies that land are usually under ~170. Cut the preamble.` });
  if (words < 25) issues.push({ level: "warn", code: "short", message: "Very short. Does it actually answer the question?" });

  // --- tone ---
  if (MARKETING_RE.test(t)) issues.push({ level: "warn", code: "marketing", message: "Marketing vocabulary detected (game-changer / seamless / unlock…). Redditors read that as an ad." });
  if ((t.match(/!/g) ?? []).length > 1 || EMOJI_RE.test(t)) issues.push({ level: "warn", code: "tone", message: "Exclamation marks or emoji read as promotional. Flatten the tone." });

  // --- competitor fairness ---
  const namedCompetitor = ctx.competitors.find((c) => c.length > 2 && new RegExp(`\\b${escapeRe(c)}\\b`, "i").test(t));
  if (namedCompetitor && NEG_RE.test(t)) {
    issues.push({ level: "warn", code: "fairness", message: `You name ${namedCompetitor} alongside harsh language. Say what it does well first; Reddit punishes vendor trash-talk.` });
  }

  return issues;
}

export function lintHasBlock(issues: LintIssue[]): boolean {
  return issues.some((i) => i.level === "block");
}
