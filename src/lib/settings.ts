import { db } from "./db";
import { parseList } from "./util";
import { getActiveProjectId } from "./project";
import type { WorkspaceContext } from "./ai";
import { DEFAULT_POLICY, parsePlaybook, type PlaybookData, type PolicyCode } from "./playbook";

/** Settings for a project; defaults to the active (cookie-selected) project. */
export async function getSettings(projectId?: string) {
  const pid = projectId ?? (await getActiveProjectId());
  return db.settings.upsert({
    where: { projectId: pid },
    update: {},
    create: { projectId: pid },
  });
}

export async function getWorkspaceContext(projectId?: string): Promise<
  WorkspaceContext & { alertThreshold: number; slackWebhook: string; lookbackDays: number }
> {
  const s = await getSettings(projectId);
  const project = await db.project.findUnique({ where: { id: s.projectId }, select: { slug: true } });
  return {
    slug: project?.slug,
    brandName: s.brandName,
    productDesc: s.productDesc,
    audience: s.audience,
    voice: s.voice,
    competitors: parseList(s.competitors),
    playbook: parsePlaybook(s.playbook),
    alertThreshold: s.alertThreshold,
    slackWebhook: s.slackWebhook,
    lookbackDays: s.lookbackDays,
  };
}

export async function getPlaybook(projectId?: string): Promise<PlaybookData> {
  return parsePlaybook((await getSettings(projectId)).playbook);
}

export interface SubPolicy {
  policy: PolicyCode;
  notes: string;
  verified: boolean;
  onFile: boolean;
}

/** All channel rules for a project, alphabetical, Reddit first. */
export async function listSubredditRules(projectId?: string) {
  const pid = projectId ?? (await getActiveProjectId());
  return db.subredditRule.findMany({ where: { projectId: pid }, orderBy: [{ platform: "asc" }, { name: "asc" }] });
}

/**
 * Policy for a subreddit within one project; a conservative default when we
 * have no rule on file. Rules stay per-project even though this deployment
 * ships one brand — the scoping is what makes adding a second one safe.
 */
export async function getSubredditPolicy(name: string, projectId?: string, platform = "REDDIT"): Promise<SubPolicy> {
  const pid = projectId ?? (await getActiveProjectId());
  const rules = await db.subredditRule.findMany({
    where: { projectId: pid, platform },
    select: { name: true, policy: true, notes: true, verified: true },
  });
  const hit = rules.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (hit) return { policy: hit.policy as PolicyCode, notes: hit.notes, verified: hit.verified, onFile: true };

  // Non-Reddit platforms have a site-wide rule (e.g. "stackoverflow.com") that
  // applies to every tag or repo underneath it.
  if (platform !== "REDDIT") {
    const site = rules.find((r) => r.name.includes("."));
    if (site) return { policy: site.policy as PolicyCode, notes: site.notes, verified: site.verified, onFile: true };
  }
  return {
    policy: DEFAULT_POLICY,
    notes: "No rule on file — check this channel's own rules before naming the product here.",
    verified: false,
    onFile: false,
  };
}

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}
