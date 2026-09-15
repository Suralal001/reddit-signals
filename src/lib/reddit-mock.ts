import type { CommentStats, RedditComment, RedditPost, SearchOptions } from "./reddit";
import { matchKeywords } from "./util";

/**
 * Fixture data so the whole pipeline runs without Reddit credentials
 * (MOCK_REDDIT=1). Timestamps are relative to "now" so lookback filters
 * behave realistically, and the text is written to match the DryDock monitor
 * keywords so a mock poll exercises every tier rather than returning nothing.
 */

const hoursAgo = (h: number) => Math.floor(Date.now() / 1000) - h * 3600;

const FIXTURES: Array<Omit<RedditPost, "permalink" | "url" | "createdUtc"> & { ageHours: number }> = [
  {
    id: "1mk01aa",
    subreddit: "EngineeringManagers",
    title: "How are you tracking what AI coding agents actually ship? Our metrics are meaningless now",
    selftext:
      "We rolled out Cursor and Claude Code to ~60 engineers. Velocity charts went vertical, but PR review load and incident count went up too. Leadership wants a dashboard that shows AI-assisted delivery risk, not just throughput. We tried LinearB and it doesn't really understand agent-generated PRs. Anyone found a tool that sits above Jira/GitHub and gives an honest picture? Budget is there, need something in the next quarter.",
    author: "vp_eng_throwaway",
    score: 148,
    numComments: 63,
    ageHours: 3,
  },
  {
    id: "1mk02bb",
    subreddit: "devops",
    title: "Policy / governance layer for AI-generated code in CI — what exists?",
    selftext:
      "Compliance is asking us to prove that AI-generated changes go through the same review gates as human ones, and to show token spend per team. Is there anything that plugs into GitHub Actions + Slack and enforces this, or is everyone building it in-house? Looking for recommendations, ideally something we can pilot in a few weeks.",
    author: "platform_pete",
    score: 92,
    numComments: 41,
    ageHours: 7,
  },
  {
    id: "1mk03cc",
    subreddit: "ExperiencedDevs",
    title: "CodeRabbit vs Qodo for AI code review — anyone used both at scale?",
    selftext:
      "Team of 40. CodeRabbit is noisy but catches stuff; Qodo felt smarter but slower. Neither gives me a leadership-level view of where AI is helping vs hurting. Curious what people are pairing these with.",
    author: "staff_eng_maria",
    score: 210,
    numComments: 118,
    ageHours: 12,
  },
  {
    id: "1mk04dd",
    subreddit: "startups",
    title: "Need a product engineering partner for a healthtech MVP — India or Eastern Europe?",
    selftext:
      "Non-technical founder, pre-seed, ~$120k budget for v1. Looking for an agency that has actually shipped regulated products (HIPAA-ish) and can do design + backend + mobile. Past experiences with Upwork freelancers were rough. Recommendations for agencies that won't ghost after the deposit?",
    author: "founder_ash",
    score: 34,
    numComments: 57,
    ageHours: 20,
  },
  {
    id: "1mk05ee",
    subreddit: "ClaudeAI",
    title: "Token costs across the org are out of control — how do you attribute spend to teams?",
    selftext:
      "Finance just sent me a bill that's 4x last quarter. We have no idea which squads or repos are burning it. Are people using anything for token economics / cost attribution across Claude, OpenAI and Cursor seats? Would happily pay for this.",
    author: "cto_of_3_people",
    score: 77,
    numComments: 29,
    ageHours: 26,
  },
  {
    id: "1mk06ff",
    subreddit: "EngineeringManagers",
    title: "Tried DryDock AI for a month — honest review",
    selftext:
      "Saw it mentioned here, gave the governance dashboard a spin. The Dockmaster agent's weekly delivery summary is genuinely useful and saved me writing status updates. Setup with GitHub was 10 minutes. Jira sync was flaky in week one but they fixed it fast. Still early but I'm keeping it.",
    author: "em_at_series_b",
    score: 41,
    numComments: 14,
    ageHours: 30,
  },
  {
    id: "1mk07gg",
    subreddit: "cursor",
    title: "Faros.ai pricing is absurd for what it does",
    selftext:
      "Got quoted for Faros for a 25-person team and nearly fell off my chair. LinearB was cheaper but the AI-agent visibility is basically nonexistent. What are mid-size teams using in 2026 for engineering intelligence?",
    author: "dev_lead_kt",
    score: 56,
    numComments: 38,
    ageHours: 40,
  },
  {
    id: "1mk08hh",
    subreddit: "SaaS",
    title: "We're a 12-person SaaS. Should we outsource our mobile app or hire?",
    selftext:
      "Web app is React, want iOS/Android in 4 months. Two options: hire two mobile devs (slow to find) or a product engineering firm. Anyone gone the agency route and been happy? What did it cost?",
    author: "saas_ops_dan",
    score: 22,
    numComments: 44,
    ageHours: 44,
  },
  {
    id: "1mk09ii",
    subreddit: "ExperiencedDevs",
    title: "Rant: DORA metrics dashboards are theatre",
    selftext:
      "Every EM tool sells the same four charts. None of them explain *why* lead time moved. Change my mind.",
    author: "grumpy_principal",
    score: 330,
    numComments: 201,
    ageHours: 50,
  },
  {
    id: "1mk10jj",
    subreddit: "devops",
    title: "DryDock AI Slack bot keeps posting duplicate summaries",
    selftext:
      "Anyone else seeing this? Two identical Dockmaster digests every Monday. Minor, but annoying. Support hasn't replied yet.",
    author: "sre_nina",
    score: 9,
    numComments: 5,
    ageHours: 55,
  },
  {
    id: "1mk11kk",
    subreddit: "EngineeringManagers",
    title: "What does 'AI delivery governance' even mean? Is this a real category?",
    selftext:
      "Seeing the phrase everywhere from vendors. Is anyone actually buying this or is it rebranded DORA dashboards?",
    author: "skeptical_em",
    score: 64,
    numComments: 47,
    ageHours: 61,
  },
  {
    id: "1mk12ll",
    subreddit: "smallbusiness",
    title: "Best tool for scheduling Instagram posts for a bakery?",
    selftext: "Just need something simple and cheap. Currently posting manually every morning.",
    author: "bakes_by_bo",
    score: 12,
    numComments: 19,
    ageHours: 8,
  },
  {
    id: "1mk13mm",
    subreddit: "ClaudeAI",
    title: "Governing agentic workflows in a regulated fintech — RFP going out next month",
    selftext:
      "We're a 200-engineer fintech. Auditors want traceability from ticket → agent → PR → deploy, with human sign-off recorded. We're putting out an RFP; if you sell something in this space or have used one, I'd like to hear about it. DX and Qodo are on the shortlist so far.",
    author: "fintech_arch",
    score: 118,
    numComments: 52,
    ageHours: 15,
  },
  {
    id: "1mk14nn",
    subreddit: "startups",
    title: "Neoito built our v1 — AMA-ish",
    selftext:
      "A few people DMed me after I mentioned working with Neoito on our logistics platform. Overall positive: strong PM layer, good on React Native, pricing was mid-range. Happy to answer questions.",
    author: "logistics_leo",
    score: 27,
    numComments: 23,
    ageHours: 70,
  },
  {
    id: "1mk15oo",
    subreddit: "ExperiencedDevs",
    title: "LinearB just added 'AI impact' reports — thoughts?",
    selftext:
      "Feels bolted-on. It counts Copilot suggestions accepted, which is not the same thing as knowing whether the agent-written code is any good. Are there tools that go deeper here?",
    author: "reviewer_ravi",
    score: 88,
    numComments: 36,
    ageHours: 5,
  },
  {
    id: "1mk16pp",
    subreddit: "devops",
    title: "Show r/devops: open-source script to tag PRs authored by AI agents",
    selftext:
      "Wrote a small GitHub Action that labels PRs where the commits came from Claude Code / Cursor / Copilot. Not a product, just sharing. Repo in comments.",
    author: "oss_ollie",
    score: 145,
    numComments: 22,
    ageHours: 33,
  },

];

function materialise(f: (typeof FIXTURES)[number]): RedditPost {
  const slug = f.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 50);
  const permalink = `/r/${f.subreddit}/comments/${f.id}/${slug}/`;
  return {
    id: f.id,
    subreddit: f.subreddit,
    title: f.title,
    selftext: f.selftext,
    author: f.author,
    permalink,
    url: `https://www.reddit.com${permalink}`,
    score: f.score,
    numComments: f.numComments,
    createdUtc: hoursAgo(f.ageHours),
  };
}

export async function mockSearch({ keywords, subreddits }: SearchOptions): Promise<RedditPost[]> {
  const subs = new Set(subreddits.map((s) => s.toLowerCase()));
  return FIXTURES.map(materialise).filter((p) => {
    if (subs.size && !subs.has(p.subreddit.toLowerCase())) return false;
    if (keywords.length === 0) return true;
    // Real Reddit search is fuzzier than this, but literal matching is a fair stand-in.
    return matchKeywords(`${p.title}\n${p.selftext}`, keywords).length > 0;
  });
}

// ---- Comments ---------------------------------------------------------------

const COMMENT_FIXTURES: Array<Omit<RedditComment, "permalink" | "createdUtc"> & { ageHours: number }> = [
  {
    id: "c0aa11",
    subreddit: "EngineeringManagers",
    body: "We ended up building a governance layer in-house and it's been a maintenance sink. If anyone knows a vendor that does agent-PR sign-off tracking properly I'd switch tomorrow — happy to be a design partner.",
    author: "em_burned_once",
    linkId: "1mk01aa",
    linkTitle: "How are you tracking what AI coding agents actually ship? Our metrics are meaningless now",
    parentId: "t3_1mk01aa",
    score: 34,
    ageHours: 2,
  },
  {
    id: "c0bb22",
    subreddit: "devops",
    body: "LinearB told us agent visibility is 'on the roadmap' six months ago. Still nothing. What are people actually using for token spend attribution per team?",
    author: "sre_on_call",
    linkId: "1mk02bb",
    linkTitle: "Policy / governance layer for AI-generated code in CI — what exists?",
    parentId: "t1_c0zz99",
    score: 12,
    ageHours: 4,
  },
  {
    id: "c0cc33",
    subreddit: "ExperiencedDevs",
    body: "DORA is fine as a baseline; the problem is nobody splits the numbers by whether an agent wrote the change. Do that and the charts get interesting fast.",
    author: "quiet_staff",
    linkId: "1mk09ii",
    linkTitle: "Rant: DORA metrics dashboards are theatre",
    parentId: "t3_1mk09ii",
    score: 88,
    ageHours: 9,
  },
  {
    id: "c0dd44",
    subreddit: "startups",
    body: "Second the agency route if you find one with a real PM layer. We used a dev agency in Kochi for our MVP and the weekly demos kept us honest. DM me if you want the name.",
    author: "ops_founder_jo",
    linkId: "1mk04dd",
    linkTitle: "Need a product engineering partner for a healthtech MVP — India or Eastern Europe?",
    parentId: "t3_1mk04dd",
    score: 7,
    ageHours: 6,
  },
  {
    id: "c0ee55",
    subreddit: "cursor",
    body: "Faros quoted us the same. Went with DryDock AI for a pilot instead; token attribution was live in a day, the Jira sync needed a nudge. Reasonable so far.",
    author: "dev_lead_kt",
    linkId: "1mk07gg",
    linkTitle: "Faros.ai pricing is absurd for what it does",
    parentId: "t3_1mk07gg",
    score: 19,
    ageHours: 20,
  },

];

export async function mockNewComments(subreddits: string[]): Promise<RedditComment[]> {
  // Mirror the real client: there is no site-wide comment firehose worth
  // reading, so a monitor with no subreddits scoped (a brand monitor watching
  // all of Reddit) gets nothing here rather than every fixture in the file.
  if (subreddits.length === 0) return [];
  const subs = new Set(subreddits.map((s) => s.toLowerCase()));
  return COMMENT_FIXTURES.filter((c) => subs.has(c.subreddit.toLowerCase())).map((c) => ({
    ...c,
    permalink: `/r/${c.subreddit}/comments/${c.linkId}/_/${c.id}/`,
    createdUtc: hoursAgo(c.ageHours),
  }));
}

/** Deterministic-ish random walk so the /replies page has something to draw. */
export async function mockCommentStats(_linkId: string, commentId: string): Promise<CommentStats> {
  let h = 0;
  for (const ch of commentId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ageMin = Math.floor(Date.now() / 60000) % 1440;
  const score = 1 + ((h % 7) + Math.floor(ageMin / 90));
  return { score, replyCount: (h >> 3) % 4, removed: h % 23 === 0 };
}

export async function mockPostComment(parentFullname: string, text: string) {
  await new Promise((r) => setTimeout(r, 400));
  const id = `mock${Math.random().toString(36).slice(2, 8)}`;
  return { id, permalink: `/r/mock/comments/${parentFullname.replace(/^t[13]_/, "")}/_/${id}/`, text };
}

export async function mockMe() {
  return { name: "sonar_mock_user", linkKarma: 1240, commentKarma: 5830 };
}
