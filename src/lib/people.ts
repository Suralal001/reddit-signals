import { db } from "./db";
import { getActiveProjectId } from "./project";
import { isPlatform, PLATFORM_META, type Platform } from "./sources/types";

/**
 * Identity across platforms.
 *
 * The rule that makes this safe to run: a Person is only ever built from what
 * someone published under their own handle — the handle itself, the display
 * name it shows, and a link to that public profile. Nothing here harvests
 * emails, enriches against a data broker, or tries to work out who an
 * anonymous account belongs to.
 *
 * Automatic resolution is exact-match only, within one project: the same
 * handle on the same platform is the same person, and that's the whole of it.
 * Linking a Reddit handle to an HN handle is a *suggestion* a human confirms,
 * because a wrong merge quietly corrupts every judgement made downstream of it
 * and is very hard to notice later.
 */

export const PERSON_STAGES = [
  { code: "SEEN", label: "Seen", desc: "They posted something we picked up. No contact yet." },
  { code: "ENGAGED", label: "Engaged", desc: "We replied to them in public." },
  { code: "CONVERSING", label: "Conversing", desc: "They replied back. There's a conversation." },
  { code: "QUALIFIED", label: "Qualified", desc: "Real fit and real intent — worth a proper conversation." },
  { code: "HANDED_OFF", label: "Handed off", desc: "Passed to sales, or moved into the outbound tool." },
  { code: "DISQUALIFIED", label: "Not a fit", desc: "Checked and ruled out. Stop surfacing them." },
] as const;

export type PersonStage = (typeof PERSON_STAGES)[number]["code"];

export function stageLabel(code: string | null | undefined): string {
  return PERSON_STAGES.find((s) => s.code === code)?.label ?? "Seen";
}

export function stageTone(code: string | null | undefined): string {
  if (code === "QUALIFIED") return "bg-hot-soft text-hot";
  if (code === "CONVERSING") return "bg-warm-soft text-warm";
  if (code === "HANDED_OFF") return "bg-accent-soft text-accent-ink";
  if (code === "DISQUALIFIED") return "bg-cool-soft text-ink-3";
  return "bg-surface-2 text-ink-2";
}

/** Authors that aren't people. Never create a Person for these. */
const NOT_A_PERSON = new Set([
  "",
  "[deleted]",
  "[removed]",
  "unknown",
  "automoderator",
  "linkedin",
  "linkedin member",
  "linkedin sales navigator",
  "producthunt",
]);

export function isRealAuthor(author: string | null | undefined): boolean {
  const a = (author ?? "").trim().toLowerCase();
  return a.length > 0 && !NOT_A_PERSON.has(a);
}

/** Public profile link for a handle, where the platform has a predictable one. */
export function profileUrlFor(platform: string, handle: string): string {
  const h = encodeURIComponent(handle.replace(/^u\//i, ""));
  switch (platform) {
    case "REDDIT":
      return `https://www.reddit.com/user/${h}`;
    case "HACKERNEWS":
      return `https://news.ycombinator.com/user?id=${h}`;
    case "GITHUB":
      return `https://github.com/${h}`;
    case "STACKOVERFLOW":
      return `https://stackoverflow.com/users?tab=Reputation&filter=all&search=${h}`;
    default:
      return "";
  }
}

/**
 * Find or create the person behind a handle, and note that we've seen them
 * again. Exact match on (project, platform, handle) — nothing fuzzy.
 */
export async function resolvePerson(
  projectId: string,
  platform: string,
  author: string,
  seenAt: Date = new Date(),
): Promise<{ id: string | null; created: boolean }> {
  if (!isRealAuthor(author)) return { id: null, created: false };
  const handle = author.trim().replace(/^u\//i, "");

  const existing = await db.personHandle.findUnique({
    where: { projectId_platform_handle: { projectId, platform, handle } },
    select: { personId: true, lastSeenAt: true },
  });

  if (existing) {
    if (seenAt > existing.lastSeenAt) {
      await db.personHandle.update({
        where: { projectId_platform_handle: { projectId, platform, handle } },
        data: { lastSeenAt: seenAt },
      });
      await db.person.update({ where: { id: existing.personId }, data: { lastSeenAt: seenAt } });
    }
    return { id: existing.personId, created: false };
  }

  const person = await db.person.create({
    data: {
      projectId,
      displayName: handle,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      handles: {
        create: {
          projectId,
          platform,
          handle,
          profileUrl: profileUrlFor(platform, handle),
          confidence: "OBSERVED",
          firstSeenAt: seenAt,
          lastSeenAt: seenAt,
        },
      },
    },
    select: { id: true },
  });
  return { id: person.id, created: true };
}

// ---- Reading ------------------------------------------------------------------

export interface PeopleFilters {
  stage?: string;
  q?: string;
  accountId?: string;
  projectId?: string;
  take?: number;
}

export async function listPeople(f: PeopleFilters = {}) {
  const projectId = f.projectId ?? (await getActiveProjectId());
  const people = await db.person.findMany({
    where: {
      projectId,
      ...(f.stage && f.stage !== "ALL" ? { stage: f.stage } : {}),
      ...(f.accountId ? { accountId: f.accountId } : {}),
      ...(f.q
        ? {
            OR: [
              { displayName: { contains: f.q } },
              { notes: { contains: f.q } },
              { handles: { some: { handle: { contains: f.q } } } },
            ],
          }
        : {}),
    },
    include: {
      handles: true,
      account: true,
      _count: { select: { leads: true } },
    },
    orderBy: [{ lastSeenAt: "desc" }],
    take: f.take ?? 200,
  });
  return people;
}

export async function getPerson(id: string) {
  return db.person.findUnique({
    where: { id },
    include: {
      handles: { orderBy: { platform: "asc" } },
      account: true,
      leads: {
        include: { thread: true, monitor: true, replies: { orderBy: { createdAt: "desc" } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function listAccounts(projectId?: string) {
  const pid = projectId ?? (await getActiveProjectId());
  return db.account.findMany({
    where: { projectId: pid },
    include: { _count: { select: { people: true } } },
    orderBy: { name: "asc" },
  });
}

export async function peopleStats(projectId?: string) {
  const pid = projectId ?? (await getActiveProjectId());
  const byStage = await db.person.groupBy({ by: ["stage"], where: { projectId: pid }, _count: { _all: true } });
  const multi = await db.person.count({ where: { projectId: pid, handles: { some: {} } } });
  const total = byStage.reduce((a, s) => a + s._count._all, 0);
  return {
    total,
    multi,
    byStage: Object.fromEntries(byStage.map((s) => [s.stage, s._count._all])) as Record<string, number>,
  };
}

// ---- Merge suggestions ---------------------------------------------------------

/** Lowercase, strip punctuation and separators, so "d-okonkwo" ≈ "d_okonkwo". */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/^u\//, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Trailing role/tech noise people add to handles on one platform but not another. */
const NOISE = /(dev|eng|engineer|io|ai|hq|official|real|the)$/;

function stripNoise(s: string): string {
  const out = s.replace(NOISE, "");
  return out.length >= 5 ? out : s;
}

export interface MergeSuggestion {
  a: { id: string; displayName: string; platform: string; handle: string };
  b: { id: string; displayName: string; platform: string; handle: string };
  reason: string;
  strength: "strong" | "weak";
}

/**
 * Cross-platform candidates, for a human to confirm or dismiss. Deliberately
 * conservative: identical handles on different platforms, and nothing shorter
 * than five characters, because "bob" on Reddit and "bob" on HN is not
 * evidence of anything.
 */
export async function suggestMerges(projectId?: string, limit = 40): Promise<MergeSuggestion[]> {
  const pid = projectId ?? (await getActiveProjectId());
  const handles = await db.personHandle.findMany({
    where: { projectId: pid },
    include: { person: { select: { id: true, displayName: true, stage: true } } },
  });

  const out: MergeSuggestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < handles.length; i++) {
    for (let j = i + 1; j < handles.length; j++) {
      const a = handles[i];
      const b = handles[j];
      if (a.personId === b.personId) continue;
      if (a.platform === b.platform) continue; // same platform, different handle = different account
      if (a.person.stage === "DISQUALIFIED" || b.person.stage === "DISQUALIFIED") continue;

      const na = normalize(a.handle);
      const nb = normalize(b.handle);
      if (na.length < 5 || nb.length < 5) continue;

      let reason = "";
      let strength: "strong" | "weak" = "weak";
      if (na === nb) {
        reason = `Same handle on ${PLATFORM_META[a.platform as Platform]?.label ?? a.platform} and ${PLATFORM_META[b.platform as Platform]?.label ?? b.platform}.`;
        strength = na.length >= 8 ? "strong" : "weak";
      } else if (stripNoise(na) === stripNoise(nb)) {
        reason = "Handles match once a trailing suffix is ignored.";
      } else if (
        normalize(a.person.displayName).length >= 6 &&
        normalize(a.person.displayName) === normalize(b.person.displayName)
      ) {
        reason = "Same display name.";
      } else {
        continue;
      }

      const key = [a.personId, b.personId].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        a: { id: a.personId, displayName: a.person.displayName, platform: a.platform, handle: a.handle },
        b: { id: b.personId, displayName: b.person.displayName, platform: b.platform, handle: b.handle },
        reason,
        strength,
      });
      if (out.length >= limit) return out;
    }
  }
  return out.sort((x, y) => (x.strength === y.strength ? 0 : x.strength === "strong" ? -1 : 1));
}

/**
 * Fold `sourceId` into `targetId`: handles and leads move across, notes are
 * appended rather than overwritten, and the earliest/most-advanced values win.
 * The source row is deleted. There is no undo, which is why nothing calls this
 * without a human clicking.
 */
export async function mergePeople(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw new Error("Can't merge a person into themselves");
  const [source, target] = await Promise.all([
    db.person.findUniqueOrThrow({ where: { id: sourceId }, include: { handles: true } }),
    db.person.findUniqueOrThrow({ where: { id: targetId }, include: { handles: true } }),
  ]);
  if (source.projectId !== target.projectId) throw new Error("Those two people are in different projects");

  const stageRank = PERSON_STAGES.map((s) => s.code as string);
  const bestStage =
    stageRank.indexOf(source.stage) > stageRank.indexOf(target.stage) ? source.stage : target.stage;

  for (const h of source.handles) {
    const clash = target.handles.find((t) => t.platform === h.platform && t.handle === h.handle);
    if (clash) await db.personHandle.delete({ where: { id: h.id } });
    else await db.personHandle.update({ where: { id: h.id }, data: { personId: targetId, confidence: "CONFIRMED" } });
  }
  // The handles that were already on the target are confirmed by this act too.
  await db.personHandle.updateMany({ where: { personId: targetId }, data: { confidence: "CONFIRMED" } });
  await db.lead.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });

  const notes = [target.notes, source.notes].filter(Boolean).join("\n\n").trim();
  await db.person.update({
    where: { id: targetId },
    data: {
      stage: bestStage,
      notes,
      displayName: target.displayName || source.displayName,
      accountId: target.accountId ?? source.accountId,
      firstSeenAt: source.firstSeenAt < target.firstSeenAt ? source.firstSeenAt : target.firstSeenAt,
      lastSeenAt: source.lastSeenAt > target.lastSeenAt ? source.lastSeenAt : target.lastSeenAt,
    },
  });
  await db.person.delete({ where: { id: sourceId } });
}

/** Which platforms we have a handle for, for the chips in the list. */
export function handlePlatforms(handles: { platform: string }[]): string[] {
  return [...new Set(handles.map((h) => h.platform))].filter((p) => isPlatform(p));
}
