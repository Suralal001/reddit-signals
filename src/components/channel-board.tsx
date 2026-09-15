import Link from "next/link";
import type { ChannelStat, ChannelStatus } from "@/lib/queries";
import { timeAgo } from "@/lib/util";
import { Sparkline } from "./sparkline";

/**
 * One card per channel the project watches. Small multiples rather than one
 * seven-series chart: seven cycled hues would be unreadable, and the question
 * a reader actually has is per-channel ("is X working, is it worth anything"),
 * not cross-channel comparison at a glance.
 *
 * Colour is reserved for state — status and heat. Channel identity comes from
 * the label, which is the dependable channel.
 */

const STATUS: Record<ChannelStatus, { label: string; dot: string; tone: string }> = {
  LIVE: { label: "Live", dot: "bg-good", tone: "text-ink-3" },
  MOCK: { label: "Fixtures", dot: "bg-warm", tone: "text-warm" },
  SETUP: { label: "Needs setup", dot: "bg-hot", tone: "text-hot" },
  OFF: { label: "Quiet", dot: "bg-neu", tone: "text-ink-3" },
};

function ChannelCard({ c, days }: { c: ChannelStat; days: number }) {
  const s = STATUS[c.status];
  const peak = Math.max(...c.series, 0);
  return (
    <Link
      href={`/leads?platform=${c.platform}${c.channel ? `&channel=${encodeURIComponent(c.channel)}` : ""}&status=ALL`}
      className="card group flex flex-col px-4 py-3.5 transition-colors hover:border-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">{c.label}</div>
          <div className={`mt-0.5 flex items-center gap-1.5 text-[11px] ${s.tone}`}>
            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
            {s.label}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold leading-none">{c.total}</div>
          <div className="mt-1 text-[11px] text-ink-3">
            {c.monitors} {c.unit}
            {c.monitors === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <div className="mt-3">
        {peak > 0 ? (
          <Sparkline values={c.series} width={220} height={30} />
        ) : (
          <div className="h-[30px] border-b border-hairline" aria-hidden />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-3">
        {c.hot > 0 && <span className="font-medium text-hot">{c.hot} worth answering</span>}
        {c.replied > 0 && <span>{c.replied} replied</span>}
        {c.lastAt ? <span>last {timeAgo(c.lastAt)}</span> : <span>nothing in {days}d</span>}
      </div>

      {c.status !== "LIVE" && c.note && (
        <p className={`mt-2 text-[11px] leading-snug ${c.status === "SETUP" ? "text-hot" : "text-ink-3"}`}>{c.note}</p>
      )}
    </Link>
  );
}

export function ChannelBoard({ channels, days = 14 }: { channels: ChannelStat[]; days?: number }) {
  if (channels.length === 0) {
    return (
      <div className="card px-6 py-10 text-center">
        <div className="text-sm font-medium text-ink-2">No channels being watched</div>
        <div className="mt-1 text-xs text-ink-3">
          Every monitor is paused, or none has a source ticked.{" "}
          <Link href="/monitors" className="text-accent hover:underline">
            Open monitors →
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {channels.map((c) => (
        <ChannelCard key={c.key} c={c} days={days} />
      ))}
    </div>
  );
}
