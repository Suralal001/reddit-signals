import "dotenv/config";
import { runPoll } from "../src/lib/poll";
import { db } from "../src/lib/db";

/**
 * Run the pipeline from the command line.
 *   npm run poll          — once
 *   npm run poll:watch    — every POLL_INTERVAL_MINUTES (default 15)
 *
 * In production, either keep poll:watch alive under a process manager, or hit
 * GET /api/cron/poll with the CRON_SECRET from Vercel Cron / GitHub Actions.
 */
async function once() {
  const t = new Date().toISOString();
  const r = await runPoll();
  console.log(
    `[${t}] seen=${r.threadsSeen} new=${r.newLeads} scored=${r.scored} alerts=${r.alerts} in ${r.durationMs}ms` +
      (r.errors.length ? `\n  errors: ${r.errors.join(" | ")}` : ""),
  );
}

async function main() {
  const watch = process.argv.includes("--watch");
  await once();
  if (!watch) {
    await db.$disconnect();
    return;
  }
  const minutes = Number(process.env.POLL_INTERVAL_MINUTES || "15");
  console.log(`Watching every ${minutes} min. Ctrl-C to stop.`);
  setInterval(() => once().catch((e) => console.error(e)), minutes * 60_000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
