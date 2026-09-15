import type { FetchOptions, Platform, SourceItem } from "./types";

/**
 * Fixtures for the non-Reddit sources so the whole pipeline is exercisable
 * offline (MOCK_SOURCES=1). Each fixture is a realistic thread of the kind the
 * monitors are meant to catch; the adapter keyword-matches locally, exactly
 * like the live ones, so an empty screen means the monitor is wrong rather
 * than the network being down.
 */

interface Fixture {
  platform: Platform;
  id: string;
  kind: "POST" | "COMMENT";
  channel: string;
  title: string;
  body: string;
  author: string;
  url: string;
  score: number;
  numComments: number;
  ageHours: number;
}

const FIXTURES: Fixture[] = [
  {
    platform: "HACKERNEWS",
    id: "hn_41880011",
    kind: "POST",
    channel: "news.ycombinator.com",
    title: "Ask HN: How are you giving your agents long-term memory in production?",
    body: "We run about a dozen internal agents on top of Claude and GPT. Every one of them starts from zero each session, so we re-feed the same 8k of context constantly. We tried Mem0 and it works per-agent, but we want one memory the whole company shares. Rolling our own on pgvector has stalled twice on entity resolution — 'J. Smith' and 'John Smith' end up as separate people and the answers get confidently wrong. What's actually working for people at 50+ engineers?",
    author: "tmwilson",
    url: "https://news.ycombinator.com/item?id=41880011",
    score: 214,
    numComments: 96,
    ageHours: 9,
  },
  {
    platform: "HACKERNEWS",
    id: "hn_41879440",
    kind: "COMMENT",
    channel: "news.ycombinator.com",
    title: "Show HN: Zep – temporal knowledge graph memory for agents",
    body: "The temporal graph part is the right idea, but I keep hitting the same wall: memory is scoped to the agent, not the organisation. What I actually need is a memory layer that every agent and every person reads from, that I can run inside our VPC because we're in healthcare and legal will not approve another cloud AI vendor. Does anything do both?",
    author: "kbergstrom",
    url: "https://news.ycombinator.com/item?id=41879440",
    score: 48,
    numComments: 0,
    ageHours: 20,
  },
  {
    platform: "HACKERNEWS",
    id: "hn_41877102",
    kind: "POST",
    channel: "news.ycombinator.com",
    title: "Ask HN: Air-gapped LLM deployments – what's your stack in 2026?",
    body: "Defence-adjacent contractor. Nothing leaves the building, no exceptions. We have local models running fine, the hard part is institutional memory: contracts, past bids, who worked on what. Enterprise search vendors all want to host it. Looking for anything genuinely on-prem with data sovereignty guarantees, ideally with an audit trail our reviewers can read.",
    author: "grimr",
    url: "https://news.ycombinator.com/item?id=41877102",
    score: 131,
    numComments: 74,
    ageHours: 33,
  },
  {
    platform: "GITHUB",
    id: "gh_2551880321",
    kind: "POST",
    channel: "langchain-ai/langchain",
    title: "Shared memory across multiple agents — is there a supported pattern?",
    body: "We have four agents (support triage, sales research, docs QA, internal helpdesk) and each keeps its own memory store. Facts learned by one are invisible to the others, so the support agent keeps re-deriving account context that the sales agent already knows. Is there a supported pattern for a single shared memory backend, or does everyone write their own? Bonus question: how are people handling conflicting facts when two agents write contradicting values?",
    author: "avanhoutte",
    url: "https://github.com/langchain-ai/langchain/issues/29104",
    score: 37,
    numComments: 12,
    ageHours: 26,
  },
  {
    platform: "GITHUB",
    id: "gh_2551441980",
    kind: "POST",
    channel: "modelcontextprotocol/servers",
    title: "Request: an MCP memory server that survives restarts and is shared between clients",
    body: "The reference memory server is per-process. I want the same memory available from Claude Desktop, Cursor and our CI bot. Ideally self-hosted. Are there production MCP memory servers people are actually running, and how do you handle auth so a contractor's Cursor can't read everything?",
    author: "sn-hartley",
    url: "https://github.com/modelcontextprotocol/servers/issues/1877",
    score: 62,
    numComments: 21,
    ageHours: 51,
  },
  {
    platform: "STACKOVERFLOW",
    id: "so_79114220",
    kind: "POST",
    channel: "retrieval-augmented-generation",
    title: "RAG returns outdated facts after the source document is updated — how do people version facts?",
    body: "Our pipeline chunks and embeds policy documents nightly. When a policy changes, the old chunks are still in the index and the model happily cites the 2023 version. Deleting by source id half works but we lose the history, and sometimes we do need to know what the policy used to say. Is there a standard approach to time-versioning facts in a retrieval system, or is bi-temporal storage the only real answer?",
    author: "mreddy",
    url: "https://stackoverflow.com/questions/79114220",
    score: 14,
    numComments: 3,
    ageHours: 40,
  },
  {
    platform: "STACKOVERFLOW",
    id: "so_79111004",
    kind: "POST",
    channel: "langchain",
    title: "Deduplicating entities across sources before embedding — best practice?",
    body: "Pulling contacts from HubSpot, Gmail and a legacy Postgres CRM. The same person appears three times with different spellings, and vector similarity does not reliably merge them, so retrieval returns three partial pictures instead of one. Is entity resolution something you do before ingest, or is there a retrieval-time trick I'm missing?",
    author: "jpetrov",
    url: "https://stackoverflow.com/questions/79111004",
    score: 9,
    numComments: 5,
    ageHours: 62,
  },
  {
    platform: "LINKEDIN",
    id: "li_mock_comment_1",
    kind: "COMMENT",
    channel: "linkedin.com",
    title: "Comment on a DryDock post",
    body: "This is the part everyone underestimates. We turned Copilot on for 200 engineers last year and the thing that actually broke was not the model, it was that nobody could say afterwards which changes an agent wrote or who signed them off. Genuine question for DryDock though — can the policy gate run in our own CI, or does the code have to leave our estate?",
    author: "helen-marsh-eng",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7301122334455667788/",
    score: 14,
    numComments: 0,
    ageHours: 6,
  },
  {
    platform: "LINKEDIN",
    id: "li_mock_mention_1",
    kind: "POST",
    channel: "linkedin.com",
    title: "Someone mentioned the company Page",
    body: "Spent the week comparing delivery intelligence tools now that half our PRs are agent-authored. LinearB and Jellyfish are both strong on flow metrics if your commits come from humans. DryDock AI is taking a different swing at it — governance and token attribution for agent output rather than another DORA dashboard. Early, but it is the question our board is actually asking. Anyone running it in production yet?",
    author: "d-okonkwo-platform",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:7301998877665544332/",
    score: 88,
    numComments: 23,
    ageHours: 21,
  },
  {
    platform: "LINKEDIN",
    id: "li_mock_salesnav_1",
    kind: "POST",
    channel: "sales-navigator",
    title: "Sales Navigator alert: buyer intent at Northwind Software",
    body: "Two people at Northwind Software showed high buyer intent this week and one visited usedrydock.com twice. Their VP of Engineering also posted about an internal AI coding rollout. Links: https://www.linkedin.com/sales/company/northwind-software",
    author: "LinkedIn Sales Navigator",
    url: "https://www.linkedin.com/sales/company/northwind-software",
    score: 0,
    numComments: 0,
    ageHours: 11,
  },
  {
    platform: "PRODUCTHUNT",
    id: "ph_recall_ai_memory",
    kind: "POST",
    channel: "artificial-intelligence",
    title: "Recall — one memory layer for every AI tool your team uses",
    body: "Launching today: a hosted memory API with connectors for Slack, Notion and Gmail, an MCP server, and a free tier. Cloud only for now, EU region coming. Would love feedback from teams running more than two agents.",
    author: "maya_recall",
    url: "https://www.producthunt.com/posts/recall-memory",
    score: 0,
    numComments: 0,
    ageHours: 14,
  },
  {
    platform: "PRODUCTHUNT",
    id: "ph_vaultmind_launch",
    kind: "POST",
    channel: "developer-tools",
    title: "VaultMind — self-hosted knowledge base for regulated teams",
    body: "On-prem AI search over your documents, with an audit log and no training on your data. Built for legal and healthcare teams who cannot use hosted assistants. Docker compose, single binary, BYO model.",
    author: "vaultmind",
    url: "https://www.producthunt.com/posts/vaultmind",
    score: 0,
    numComments: 0,
    ageHours: 30,
  },
];

export async function mockFetch(platform: Platform, { keywords, since }: FetchOptions): Promise<SourceItem[]> {
  const hay = keywords.map((k) => k.toLowerCase());
  const out: SourceItem[] = [];
  for (const f of FIXTURES) {
    if (f.platform !== platform) continue;
    const created = new Date(Date.now() - f.ageHours * 3_600_000);
    if (created < since) continue;
    const text = `${f.title}\n${f.body}`.toLowerCase();
    if (hay.length && !hay.some((k) => text.includes(k))) continue;
    out.push({
      id: f.id,
      platform: f.platform,
      kind: f.kind,
      channel: f.channel,
      title: f.title,
      body: f.body,
      author: f.author,
      permalink: f.url,
      url: f.url,
      score: f.score,
      numComments: f.numComments,
      createdUtc: created,
    });
  }
  return out;
}
