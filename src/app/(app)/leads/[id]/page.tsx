import Link from "next/link";
import { notFound } from "next/navigation";
import { getLead, personHistory } from "@/lib/queries";
import { stageLabel, stageTone } from "@/lib/people";
import { getSettings, getSubredditPolicy } from "@/lib/settings";
import { capacities, listOperators, operatorHasCredentials, platformCanPost, suggestOperator, threadLock } from "@/lib/operators";
import { channelLabel, isPlatform, PLATFORM_META } from "@/lib/sources/types";
import { POLICIES, signalLabel } from "@/lib/playbook";
import { parseList, redditUrl, timeAgo, truncate } from "@/lib/util";
import { CommentChip, KindChip, PageHeader, ScoreBadge, SentimentChip, SignalChip, StatusChip } from "@/components/ui";
import { ReplyComposer } from "@/components/reply-composer";
import { LeadActions } from "@/components/lead-actions";

export const dynamic = "force-dynamic";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const t = lead.thread;
  const platform = isPlatform(t.platform) ? t.platform : "REDDIT";
  const meta = PLATFORM_META[platform];
  const [settings, sub, allOperators, caps, routing, lock] = await Promise.all([
    getSettings(lead.monitor.projectId),
    getSubredditPolicy(t.subreddit, lead.monitor.projectId, platform),
    listOperators(lead.monitor.projectId),
    capacities(lead.monitor.projectId),
    suggestOperator(lead),
    threadLock(lead.threadId, lead.assignedOperatorId ?? null),
  ]);
  const operators = allOperators
    .filter((o) => o.platform === platform && o.active)
    .map((o) => ({
      id: o.id,
      name: o.name,
      handle: o.handle,
      left: caps.get(o.id)?.left ?? o.dailyCap,
      cap: o.dailyCap,
      risk: o.shadowbanRisk,
      hasCredentials: operatorHasCredentials(o),
      warming: Boolean(o.warmedUntil && o.warmedUntil > new Date()),
    }));
  const history = lead.personId ? await personHistory(lead.personId, lead.id) : null;
  const kws = parseList(lead.matchedKeywords);
  const posted = lead.replies.find((r) => r.status === "POSTED");
  const latestDraft = lead.replies.find((r) => r.status === "DRAFT");
  const isComment = t.kind === "COMMENT";

  return (
    <>
      <div className="mb-3 text-xs text-ink-3">
        <Link href="/leads" className="hover:text-accent">
          ← Leads
        </Link>
      </div>
      <PageHeader
        title={isComment ? `Comment by u/${t.author}` : t.title}
        sub={isComment ? `on “${t.title}”` : undefined}
        action={<LeadActions leadId={lead.id} status={lead.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <section className="card">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-5 py-3 text-xs text-ink-3">
              {isComment && <CommentChip />}
              <span className="font-medium text-ink-2">{channelLabel(t.platform, t.subreddit)}</span>
              <span>{platform === "REDDIT" ? `u/${t.author}` : t.author}</span>
              <span>{timeAgo(t.createdUtc)}</span>
              <span>{isComment ? `↑${t.score}` : `↑${t.score} · ${t.numComments} comments`}</span>
              <a href={redditUrl(t.permalink)} target="_blank" rel="noreferrer" className="ml-auto text-accent hover:underline">
                Open on {meta.label} ↗
              </a>
            </div>
            <div className="prose-reddit px-5 py-4 text-sm text-ink">{t.body || <span className="text-ink-3">(link post, no body)</span>}</div>
          </section>

          <section className="card px-5 py-4">
            <div className="mb-3 flex items-center gap-3">
              <ScoreBadge score={lead.intentScore} size="lg" />
              <div>
                <div className="text-sm font-medium">
                  {lead.monitor.kind === "LEAD" ? "Buying intent" : lead.monitor.kind === "BRAND" ? "Needs a response" : "Switching opportunity"}
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-3">
                  <SignalChip signal={lead.signal} /> relevance {lead.relevance ?? "–"}/100 · <KindChip kind={lead.monitor.kind} /> {lead.monitor.name}
                  {lead.monitor.kind !== "LEAD" && (
                    <>
                      {" "}
                      · <SentimentChip sentiment={lead.sentiment} />
                    </>
                  )}
                </div>
              </div>
              <div className="ml-auto">
                <StatusChip status={lead.status} />
              </div>
            </div>
            {lead.scoredAt ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-[110px_1fr]">
                <dt className="text-ink-3">Why</dt>
                <dd>{lead.intentReason}</dd>
                <dt className="text-ink-3">Summary</dt>
                <dd>{lead.summary}</dd>
                <dt className="text-ink-3">Angle</dt>
                <dd className={lead.angle === "none" ? "text-ink-3" : ""}>{lead.angle === "none" ? "Stay out of this one." : lead.angle}</dd>
                {kws.length > 0 && (
                  <>
                    <dt className="text-ink-3">Matched</dt>
                    <dd className="flex flex-wrap gap-1">
                      {kws.map((k) => (
                        <span key={k} className="chip">
                          {k}
                        </span>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-sm text-ink-3">Not scored yet — it will be on the next poll.</p>
            )}
          </section>
        </div>

        <div className="space-y-4">
          {lead.person && (
            <section className="card px-4 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/people/${lead.person.id}`} className="text-sm font-medium hover:underline">
                  {lead.person.displayName || t.author}
                </Link>
                <span className={`chip ${stageTone(lead.person.stage)}`}>{stageLabel(lead.person.stage)}</span>
                {lead.person.account && <span className="chip">{lead.person.account.name}</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-ink-3">
                {lead.person.handles.map((h) => (
                  <span key={h.id}>
                    <span className="text-ink-2">{PLATFORM_META[h.platform as keyof typeof PLATFORM_META]?.short ?? h.platform}</span>
                    /{h.handle}
                  </span>
                ))}
              </div>
              {history && history.leads.length > 0 ? (
                <>
                  <p className="mt-2 text-ink-2">
                    {history.leads.length} other thread{history.leads.length === 1 ? "" : "s"} from them
                    {history.repliedCount > 0
                      ? ` · we've already replied to ${history.repliedCount} of them`
                      : " · we haven't replied to them before"}
                    . Read these before drafting.
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {history.leads.slice(0, 4).map((h) => (
                      <li key={h.id}>
                        <Link href={`/leads/${h.id}`} className="text-ink-2 hover:text-accent hover:underline">
                          {channelLabel(h.thread.platform, h.thread.subreddit)} ·{" "}
                          {truncate(h.thread.kind === "COMMENT" ? h.thread.body.replace(/\s+/g, " ") : h.thread.title, 70)}
                        </Link>
                        {h.replies.length > 0 && <span className="text-ink-3"> — replied</span>}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-ink-3">First time we&apos;ve seen them.</p>
              )}
              {lead.person.notes && <p className="mt-2 text-ink-2">{truncate(lead.person.notes, 200)}</p>}
            </section>
          )}

          <section
            className={`card px-4 py-3 text-xs ${
              sub.policy === "NO_PROMO" ? "border-hot/30 bg-hot-soft/40" : sub.policy === "VALUE_ONLY" ? "border-warm/30 bg-warm-soft/60" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-ink">
                {channelLabel(t.platform, t.subreddit)}: {POLICIES[sub.policy].label}
              </span>
              <span className="text-ink-3">{sub.onFile ? (sub.verified ? "verified" : "unverified") : "no rule on file"}</span>
            </div>
            <p className="mt-1 text-ink-2">{POLICIES[sub.policy].short}</p>
            {sub.notes && <p className="mt-1 text-ink-3">{sub.notes}</p>}
            {lead.signal && signalLabel(lead.signal) !== "—" && (
              <p className="mt-1.5 text-ink-2">
                Signal: <span className="font-medium text-ink">{signalLabel(lead.signal)}</span>
              </p>
            )}
          </section>
          <ReplyComposer
            leadId={lead.id}
            initialDraft={latestDraft?.body ?? ""}
            posted={
              posted
                ? {
                    permalink: posted.permalink ?? "",
                    at: posted.postedAt?.toISOString() ?? "",
                    operatorName: allOperators.find((o) => o.id === posted.operatorId)?.name ?? null,
                  }
                : null
            }
            replyingTo={isComment ? `${platform === "REDDIT" ? "u/" : ""}${t.author}'s comment` : "the post"}
            lint={{ brandName: settings.brandName, competitors: parseList(settings.competitors), policy: sub.policy }}
            operators={operators}
            assignedOperatorId={lead.assignedOperatorId}
            routingReason={routing.reason}
            lockReason={posted ? null : (lock.locked ? lock.reason : null)}
            canPost={platformCanPost(platform)}
            platformLabel={meta.label}
          />
          {lead.replies.length > 0 && (
            <section className="card px-4 py-3">
              <div className="mb-2 text-xs font-medium text-ink-2">History</div>
              <ul className="space-y-2">
                {lead.replies.map((r) => (
                  <li key={r.id} className="text-xs text-ink-3">
                    <span
                      className={`mr-1.5 font-medium ${r.status === "POSTED" ? "text-good" : r.status === "FAILED" ? "text-hot" : "text-ink-2"}`}
                    >
                      {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                    </span>
                    {timeAgo(r.createdAt)}
                    {r.error && <span className="text-hot"> — {r.error}</span>}
                    <div className="mt-0.5 line-clamp-2 text-ink-2">{r.body}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
