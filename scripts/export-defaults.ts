/**
 * Freezes PROJECT_DEFAULTS into prisma/seed.json at build time.
 *
 * The runtime image has no TypeScript and no Prisma CLI, but the seed has to
 * come from the same place as the "Load defaults" button or the two quietly
 * diverge. Exporting it during the build keeps one source of truth and leaves
 * the runtime with a plain JSON file and twenty lines of SQL.
 *
 *   tsx scripts/export-defaults.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PROJECT_DEFAULTS } from "../src/lib/playbook";

const PROJECTS = [{ id: "proj_drydock", name: "DryDock AI", slug: "drydock" as const }];

const payload = PROJECTS.map((p) => {
  const d = PROJECT_DEFAULTS[p.slug];
  if (!d) throw new Error(`No defaults for ${p.slug}`);
  return {
    ...p,
    settings: {
      brandName: d.settings?.brandName ?? p.name,
      productDesc: d.settings?.productDesc ?? "",
      audience: d.settings?.audience ?? "",
      voice: d.settings?.voice ?? "",
      competitors: d.settings?.competitors ?? [],
      // The one asset shared by every subreddit; links to it are budgeted globally.
      brandDomain: d.settings?.brandDomain ?? "",
      playbook: d.playbook,
    },
    subredditRules: d.subredditRules,
    monitors: d.monitors,
  };
});

const out = path.resolve(process.cwd(), "prisma/seed.json");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(payload, null, 2));
console.log(`[export-defaults] wrote ${out} (${payload.length} project${payload.length === 1 ? "" : "s"})`);
