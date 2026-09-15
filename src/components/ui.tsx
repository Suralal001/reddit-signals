import Link from "next/link";
import { parseList, redditUrl, scoreTone, timeAgo, truncate } from "@/lib/util";
import type { LeadWithRefs } from "@/lib/queries";
import { signalIsHot, signalLabel } from "@/lib/playbook";
import { channelLabel, isPlatform, PLATFORM_META } from "@/lib/sources/types";

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-ink-2">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function ScoreBadge({ score, size = "md" }: { score: number | null | undefined; size?: "sm" | "md" | "lg" }) {
  const tone = scoreTone(score);
  const cls = {
    hot: "bg-hot-soft text-hot",
    warm: "bg-warm-soft text-warm",
    cool: "bg-cool-soft text-cool",
    none: "bg-cool-soft text-ink-3",
  }[tone];
  const sz = { sm: "h-6 min-w-6 px-1.5 text-xs", md: "h-8 min-w-8 px-2 text-sm", lg: "h-12 min-w-12 px-3 text-xl" }[size];
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg font-semibold tabular-nums ${cls} ${sz}`}
      title={score == null ? "Not scored yet" : `Intent score ${score}/100`}
    >
      {score ?? "–"}
    </span>
  );
}

export function KindChip({ kind }: { kind: string }) {
  const label = kind === "LEAD" ? "Lead" : kind === "BRAND" ? "Brand" : "Competitor";
  return <span className="chip">{label}</span>;
}

export function SentimentChip({ sentiment }: { sentiment: string | null | undefined }) {
  if (!sentiment) return null;
  const dot = sentiment === "POSITIVE" ? "bg-pos" : sentiment === "NEGATIVE" ? "bg-neg" : "bg-neu";
  const label = sentiment.charAt(0) + sentiment.slice(1).toLowerCase();
  return (
    <span className="chip gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const cls =
    status === "REPLIED"
      ? "bg-accent-soft text-accent-ink"
      : status === "DISMISSED"
        ? "bg-cool-soft text-ink-3"
        : status === "SAVED"
          ? "bg-warm-soft text-warm"
          : "bg-surface-2 text-ink-2";
  return <span className={`chip ${cls}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

export function SignalChip({ signal }: { signal: string | null | undefined }) {
  if (!signal || signal === "NONE") return null;
  const hot = signalIsHot(signal);
  return <span className={`chip ${hot ? "bg-hot-soft text-hot" : ""}`}>{signalLabel(signal)}</span>;
}

export function CommentChip() {
  return <span className="chip bg-accent-soft text-accent-ink">Comment</span>;
}

export function PlatformChip({ platform }: { platform: string | null | undefined }) {
  if (!platform || platform === "REDDIT") return null;
  const meta = isPlatform(platform) ? PLATFORM_META[platform] : null;
  if (!meta) return null;
  return (
    <span className="chip" title={meta.canPost ? undefined : "Read-only here — reply in the browser"}>
      {meta.label}
    </span>
  );
}

export function LeadRow({ lead, showMonitor = true }: { lead: LeadWithRefs; showMonitor?: boolean }) {
  const t = lead.thread;
  const kws = parseList(lead.matchedKeywords);
  const isComment = t.kind === "COMMENT";
  return (
    <li className="flex gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2/60">
      <div className="pt-0.5">
        <ScoreBadge score={lead.intentScore} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <PlatformChip platform={t.platform} />
          {isComment && <CommentChip />}
          <Link href={`/leads/${lead.id}`} className="min-w-0 truncate font-medium text-ink hover:underline">
            {isComment ? truncate(t.body.replace(/\s+/g, " "), 140) : t.title}
          </Link>
        </div>
        {isComment && <div className="mt-0.5 truncate text-xs text-ink-3">on “{t.title}”</div>}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          <span className="font-medium text-ink-2">{channelLabel(t.platform, t.subreddit)}</span>
          <span>{t.platform === "REDDIT" || !t.platform ? `u/${t.author}` : t.author}</span>
          <span>{timeAgo(t.createdUtc)}</span>
          <span>
            ↑{t.score} · {t.numComments} comments
          </span>
          {showMonitor && (
            <>
              <span>·</span>
              <KindChip kind={lead.monitor.kind} />
              <span>{lead.monitor.name}</span>
            </>
          )}
          <SignalChip signal={lead.signal} />
          {lead.monitor.kind !== "LEAD" && <SentimentChip sentiment={lead.sentiment} />}
          {lead.status !== "NEW" && <StatusChip status={lead.status} />}
        </div>
        {lead.summary && lead.summary !== t.title && !(isComment && lead.summary === t.body) && (
          <p className="mt-1.5 text-sm text-ink-2">{truncate(lead.summary, 220)}</p>
        )}
        {kws.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {kws.slice(0, 5).map((k) => (
              <span key={k} className="chip">
                {k}
              </span>
            ))}
          </div>
        )}
      </div>
      <a
        href={redditUrl(t.permalink)}
        target="_blank"
        rel="noreferrer"
        className="self-start text-xs text-ink-3 hover:text-accent"
        title="Open on Reddit"
      >
        ↗
      </a>
    </li>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card px-6 py-12 text-center">
      <div className="text-sm font-medium text-ink-2">{title}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}
