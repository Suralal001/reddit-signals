import Link from "next/link";
import { listPostedReplies } from "@/lib/queries";
import { redditUrl, timeAgo, truncate } from "@/lib/util";
import { CommentChip, Empty, KindChip, PageHeader } from "@/components/ui";
import { Sparkline } from "@/components/sparkline";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export default async function RepliesPage() {
  const { replies, totals } = await listPostedReplies(30);

  return (
    <>
      <PageHeader
        title="Replies"
        sub="Everything posted from this account in the last 30 days, with how it's doing. Scores refresh hourly for 14 days."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Posted" value={totals.posted} sub="last 30 days" />
        <Stat label="Upvotes" value={totals.totalScore} sub={totals.avgScore != null ? `avg ${totals.avgScore} per reply` : "not checked yet"} />
        <Stat label="Replies received" value={totals.totalReplies} sub="direct replies to yours" />
        <Stat
          label="Removed"
          value={totals.removed}
          sub={totals.posted ? `${Math.round((totals.removed / totals.posted) * 100)}% — keep this near zero` : "—"}
        />
      </div>

      {replies.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-3">
              <tr className="border-b border-hairline">
                <th className="px-4 py-2.5 font-medium">Where</th>
                <th className="px-4 py-2.5 font-medium">Your reply</th>
                <th className="px-4 py-2.5 text-right font-medium">Score</th>
                <th className="px-4 py-2.5 text-right font-medium">Replies</th>
                <th className="px-4 py-2.5 font-medium">Trend</th>
                <th className="px-4 py-2.5 font-medium">Posted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {replies.map((r) => {
                const t = r.lead.thread;
                return (
                  <tr key={r.id} className={r.removed ? "opacity-60" : ""}>
                    <td className="max-w-72 px-4 py-3 align-top">
                      <div className="flex items-center gap-1.5 text-xs text-ink-3">
                        <span className="font-medium text-ink-2">r/{t.subreddit}</span>
                        <KindChip kind={r.lead.monitor.kind} />
                        {t.kind === "COMMENT" && <CommentChip />}
                      </div>
                      <Link href={`/leads/${r.lead.id}`} className="mt-0.5 line-clamp-2 font-medium hover:underline">
                        {t.title}
                      </Link>
                    </td>
                    <td className="max-w-md px-4 py-3 align-top text-ink-2">
                      <div className="line-clamp-2">{truncate(r.body, 200)}</div>
                      <div className="mt-1 flex gap-3 text-xs">
                        {r.permalink && (
                          <a href={redditUrl(r.permalink)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                            View ↗
                          </a>
                        )}
                        {r.removed && <span className="font-medium text-hot">Removed by mods/filters</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right align-top tabular-nums">{r.score ?? <span className="text-ink-3">–</span>}</td>
                    <td className="px-4 py-3 text-right align-top tabular-nums">{r.replyCount ?? <span className="text-ink-3">–</span>}</td>
                    <td className="px-4 py-3 align-top">
                      <Sparkline values={r.stats.map((s) => s.score)} />
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-ink-3">
                      {r.postedAt ? timeAgo(r.postedAt) : "–"}
                      {r.checkedAt && <div>checked {timeAgo(r.checkedAt)}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Nothing posted yet" hint="Replies you post from a lead page show up here with their upvotes and responses." />
      )}
    </>
  );
}
