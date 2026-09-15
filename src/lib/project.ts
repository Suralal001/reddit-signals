import { db } from "./db";

/**
 * Multi-project support. The active project is a cookie; server components and
 * actions resolve it via getActiveProjectId(). Contexts that have no cookies
 * (the cron poller) fall back to the oldest project — but the poller passes
 * explicit per-monitor project ids anyway.
 */

export const PROJECT_COOKIE = "sonar_project";
export const DEFAULT_PROJECT_ID = "proj_drydock";

export async function listProjects() {
  return db.project.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getActiveProjectId(): Promise<string> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const v = jar.get(PROJECT_COOKIE)?.value;
    if (v) {
      const exists = await db.project.findUnique({ where: { id: v }, select: { id: true } });
      if (exists) return v;
    }
  } catch {
    // No request scope (cron/CLI) — fall through to default.
  }
  const first = await db.project.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  return first?.id ?? DEFAULT_PROJECT_ID;
}

export async function getActiveProject() {
  const id = await getActiveProjectId();
  return db.project.findUniqueOrThrow({ where: { id } });
}
