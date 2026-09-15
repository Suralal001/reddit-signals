import { db } from "../src/lib/db";
import { PROJECT_DEFAULTS } from "../src/lib/playbook";

/**
 * Starter workspace. Only runs on an empty database — edit everything in the
 * UI afterwards. `npm run db:seed`
 *
 * Everything it seeds comes from PROJECT_DEFAULTS in src/lib/playbook.ts, so
 * this file never drifts from the "Load defaults" button in the app.
 */

const PROJECTS: { id: string; name: string; slug: keyof typeof PROJECT_DEFAULTS }[] = [
  { id: "proj_drydock", name: "DryDock AI", slug: "drydock" },
];

async function main() {
  const existing = await db.monitor.count();
  if (existing > 0) {
    console.log("Database already has monitors; skipping seed.");
    return;
  }

  for (const p of PROJECTS) {
    const defaults = PROJECT_DEFAULTS[p.slug];
    if (!defaults) continue;

    await db.project.upsert({
      where: { id: p.id },
      update: { name: p.name, slug: p.slug },
      create: { id: p.id, name: p.name, slug: p.slug },
    });

    const s = defaults.settings;
    const settings = {
      brandName: s?.brandName ?? p.name,
      productDesc: s?.productDesc ?? "",
      audience: s?.audience ?? "",
      voice: s?.voice ?? "",
      competitors: JSON.stringify(s?.competitors ?? []),
      playbook: JSON.stringify(defaults.playbook),
    };
    await db.settings.upsert({
      where: { projectId: p.id },
      update: settings,
      create: { projectId: p.id, ...settings },
    });

    for (const r of defaults.subredditRules) {
      await db.subredditRule.upsert({
        where: { projectId_platform_name: { projectId: p.id, platform: "REDDIT", name: r.name } },
        update: r,
        create: { projectId: p.id, platform: "REDDIT", ...r },
      });
    }

    await db.monitor.createMany({
      data: defaults.monitors.map((m) => ({
        projectId: p.id,
        name: m.name,
        kind: m.kind,
        keywords: JSON.stringify(m.keywords),
        subreddits: JSON.stringify(m.subreddits),
        platforms: JSON.stringify(["REDDIT"]),
        sources: "{}",
        scanComments: m.scanComments,
      })),
    });

    console.log(
      `Seeded ${p.name}: playbook, ${defaults.subredditRules.length} channel rules, ${defaults.monitors.length} monitors.`,
    );
  }

  console.log("Add the people who will reply on the Operators page — drafts have nowhere to go until then.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect?.();
  });
