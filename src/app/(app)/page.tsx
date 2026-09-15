import Link from "next/link";
import { actionQueue, channelActivity, dashboardStats, listLeads, sentimentSeries, signalMix } from "@/lib/queries";
import { getActiveProject } from "@/lib/project";
import { isMock, timeAgo } from "@/lib/util";
import { Empty, LeadRow, PageHeader } from "@/components/ui";
import { SentimentChart } from "@/components/sentiment-chart";
import { ChannelBoard } from "@/components/channel-board";
import { SignalMix } from "@/components/signal-mix";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 14;

/**
 * Stat tile: label, value, an optional delta line, an optional trend.
 * Values use the font's proportional figures — tabular-nums is for columns.
 */
function Stat({
  label,
  value,
  sub,
  href,
  tone = "ink",
}: {
  label: string;
  value: string | number;
  sub?: React.ReactNode;
  href?: string;
  tone?: "ink" | "hot";
}) {
  const body = (
    <div className="card h-full px-4 py-3.5 transition-colors group-hover:border-accent/40">
      <div className="text-xs text-ink-2">{label}</div>
      <div className={`mt-1 text-2xl font-semibold leading-none ${tone === "hot" ? "text-hot" : ""}`}>{value}</div>
      {sub && <div className="mt-1.5 text-xs leading-snug text-ink-3">{sub}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="group block">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function Dashboard() {
  const project = await getActiveProject();
  const [stats, queue, channels, signals, hot, brand] = await Promise.all([
    dashboardStats(project.id),
    actionQueue(project.id),
    channelActivity(project.id, WINDOW_DAYS),
    signalMix(project.id, WINDOW_DAYS),
    listLeads({ projectId: project.id, status: "NEW", minScore: 1, take: 6 }),
    sentimentSeries("BRAND", WINDOW_DAYS, project.id),
  ]);

  const mockOn = isMock("REDDIT") || isMock("AI");
  const live = channels.filter((c) => c.status === "LIVE").length;
  const needsSetup = channels.filter((c) => c.status === "SETUP");
  const capacityLeft = Math.max(0, queue.capacityToday - queue.repliesToday);

  return (
    <>
      <PageHeader
        title={project.name}
        sub={
          stats.lastRun
            ? `Last poll ${timeAgo(stats.lastRun.startedAt)} · ${stats.monitors} active monitor${stats.monitors === 1 ? "" : "s"} · ${live} of ${channels.length} channels live`
            : "No polls yet — hit “Poll now” in the sidebar to fill this in."
        }
        action={
          <Link href="/leads" className="btn-secondary">
            Open the queue
          </Link>
        }
      />

      {/* The one hero figure: what a person should act on today. */}
      <section className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Link href={`/leads?min=${queue.threshold}`} className="group block">
          <div className="card h-full border-accent/25 bg-accent-soft/30 px-5 py-4 transition-colors group-hover:border-accent/50">
            <div className="text-xs font-medium text-accent-ink">Worth answering now</div>
            <div className="mt-1 text-5xl font-semibold leading-none tracking-tight">{queue.worthAnswering}</div>
            <div className="mt-2 text-xs leading-snug text-ink-2">
              {queue.worthAnswering === 0 ? (
                <>Nothing over the {queue.threshold} threshold is waiting. Everything scored is either answered or below the bar.</>
              ) : (
                <>
                  Scored {queue.threshold}+ with real relevance.{" "}
                  {queue.unassigned > 0 ? (
                    <span className="font-medium text-ink">{queue.unassigned} not routed to anyone yet.</span>
                  ) : (
                    <>All routed to an operator.</>
                  )}
                </>
              )}
            </div>
          </div>
        </Link>

        <Stat
          label="Replies today"
          value={`${queue.repliesToday} / ${queue.capacityToday}`}
          href="/replies"
          sub={
            queue.operators === 0 ? (
              <span className="text-hot">No operators yet — drafts have nowhere to go.</span>
            ) : (
              `${capacityLeft} left across ${queue.operators} operator${queue.operators === 1 ? "" : "s"}`
            )
          }
        />
        <Stat
          label="Replies posted"
          value={stats.replied30d}
          href="/replies"
          sub={`last 30 days · ${stats.replyScore30d} upvotes earned`}
        />
        <Stat
          label="Brand mentions"
          value={stats.brandMentions7d}
          href="/brand"
          tone={stats.brandNegative7d > 0 ? "hot" : "ink"}
          sub={
            stats.brandNegative7d > 0
              ? `last 7 days · ${stats.brandNegative7d} negative, answer those first`
              : "last 7 days · nothing negative"
          }
        />
      </section>

      {/* Channels — where the signal is actually coming from. */}
      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Channels</h2>
          <span className="text-xs text-ink-3">Threads picked up in the last {WINDOW_DAYS} days · click one to filter the queue</span>
        </div>
        <ChannelBoard channels={channels} days={WINDOW_DAYS} />

        {(mockOn || needsSetup.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-3">
            {mockOn && (
              <div className="card flex-1 basis-72 border-warm/30 bg-warm-soft/50 px-4 py-2.5 text-xs leading-snug text-ink-2">
                <span className="font-medium text-ink">Fixtures, not the real world.</span>{" "}
                {isMock("REDDIT") ? "Reddit is serving fixture threads" : ""}
                {isMock("REDDIT") && isMock("AI") ? " and " : ""}
                {isMock("AI") ? "scoring is heuristic rather than the model" : ""}. Set{" "}
                <code>MOCK_REDDIT=0</code> / <code>MOCK_AI=0</code> in <code>.env</code> to go live.
              </div>
            )}
            {needsSetup.map((c) => (
              <div key={c.key} className="card flex-1 basis-72 border-hot/25 bg-hot-soft/40 px-4 py-2.5 text-xs leading-snug text-ink-2">
                <span className="font-medium text-hot">{c.label} isn&apos;t running.</span> {c.note}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">Highest intent, unanswered</h2>
            <Link href="/leads" className="text-xs text-accent hover:underline">
              All leads →
            </Link>
          </div>
          {hot.leads.length ? (
            <ul className="card divide-y divide-hairline">
              {hot.leads.map((l) => (
                <LeadRow key={l.id} lead={l} />
              ))}
            </ul>
          ) : (
            <Empty
              title="Nothing scored yet"
              hint="Run a poll to pull threads in, then the scorer ranks them by intent."
            />
          )}
        </section>

        <aside className="space-y-4">
          <SignalMix slices={signals} days={WINDOW_DAYS} />
          <SentimentChart data={brand} title="Brand sentiment" width={300} />

          {queue.actorIssues.length > 0 && (
            <section className="card border-hot/25 px-4 py-3.5">
              <div className="mb-1.5 text-sm font-medium">
                Apify needs attention
                <Link href="/apify" className="ml-2 text-xs font-normal text-accent hover:underline">
                  fix →
                </Link>
              </div>
              <ul className="space-y-2">
                {queue.actorIssues.map((a) => (
                  <li key={a.name} className="text-xs leading-snug text-ink-2">
                    <span className="font-medium text-ink">{a.name}</span>
                    <div className="mt-0.5 line-clamp-3 text-ink-3">{a.error}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stats.lastRun?.error && (
            <section className="card border-hot/25 bg-hot-soft/30 px-4 py-3.5">
              <div className="mb-1 text-sm font-medium text-hot">Last poll reported errors</div>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-snug text-ink-2">{stats.lastRun.error}</pre>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
