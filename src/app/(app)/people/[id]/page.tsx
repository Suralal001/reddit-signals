import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveProject } from "@/lib/project";
import { getPerson, listAccounts, stageLabel, stageTone, PERSON_STAGES } from "@/lib/people";
import { forgetPerson, savePerson, splitHandle } from "@/lib/actions";
import { PLATFORM_META, channelLabel } from "@/lib/sources/types";
import { redditUrl, timeAgo, truncate } from "@/lib/util";
import { PageHeader, ScoreBadge, SignalChip, StatusChip } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [person, project] = await Promise.all([getPerson(id), getActiveProject()]);
  if (!person || person.projectId !== project.id) notFound();
  const accounts = await listAccounts(project.id);

  const replies = person.leads.flatMap((l) => l.replies.filter((r) => r.status === "POSTED"));
  const channels = [...new Set(person.leads.map((l) => channelLabel(l.thread.platform, l.thread.subreddit)))];

  return (
    <>
      <div className="mb-3 text-xs text-ink-3">
        <Link href="/people" className="hover:text-accent">
          ← People
        </Link>
      </div>
      <PageHeader
        title={person.displayName || "(no name)"}
        sub={`First seen ${timeAgo(person.firstSeenAt)} · ${person.leads.length} thread${person.leads.length === 1 ? "" : "s"} · ${replies.length} repl${replies.length === 1 ? "y" : "ies"} from us`}
        action={<span className={`chip ${stageTone(person.stage)}`}>{stageLabel(person.stage)}</span>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="card px-5 py-4">
            <div className="mb-3 text-sm font-medium">Accounts they post from</div>
            <ul className="divide-y divide-hairline">
              {person.handles.map((h) => {
                const meta = PLATFORM_META[h.platform as keyof typeof PLATFORM_META];
                return (
                  <li key={h.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="chip">{meta?.label ?? h.platform}</span>
                    <span className="font-medium">{h.platform === "REDDIT" ? `u/${h.handle}` : h.handle}</span>
                    {h.profileUrl && (
                      <a href={h.profileUrl} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                        profile ↗
                      </a>
                    )}
                    <span className="chip" title={h.confidence === "CONFIRMED" ? "A human confirmed this is the same person" : "Seen posting under this handle"}>
                      {h.confidence === "CONFIRMED" ? "confirmed" : "observed"}
                    </span>
                    <span className="ml-auto text-xs text-ink-3">seen {timeAgo(h.lastSeenAt)}</span>
                    {person.handles.length > 1 && (
                      <form action={splitHandle.bind(null, h.id)}>
                        <button className="btn-ghost px-2 py-1 text-xs" title="Not the same person — split this account out">
                          Split off
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            {person.handles.length > 1 && (
              <p className="hint mt-2">
                These were linked by hand. If a merge was wrong, split it — everything downstream reads this as one person.
              </p>
            )}
          </section>

          <section className="card">
            <div className="border-b border-hairline px-5 py-3 text-sm font-medium">
              Everything they&apos;ve said that we picked up
            </div>
            {person.leads.length === 0 ? (
              <p className="px-5 py-4 text-sm text-ink-3">No threads on file.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {person.leads.map((l) => {
                  const t = l.thread;
                  const posted = l.replies.find((r) => r.status === "POSTED");
                  return (
                    <li key={l.id} className="flex gap-4 px-5 py-3.5">
                      <ScoreBadge score={l.intentScore} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
                          {t.kind === "COMMENT" ? truncate(t.body.replace(/\s+/g, " "), 120) : t.title}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                          <span className="text-ink-2">{channelLabel(t.platform, t.subreddit)}</span>
                          <span>{timeAgo(t.createdUtc)}</span>
                          <SignalChip signal={l.signal} />
                          {l.status !== "NEW" && <StatusChip status={l.status} />}
                          <a href={redditUrl(t.permalink)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                            open ↗
                          </a>
                        </div>
                        {posted && (
                          <div className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
                            <span className="font-medium text-ink">We replied</span> {timeAgo(posted.postedAt ?? posted.createdAt)}
                            {posted.score != null ? ` · ↑${posted.score}` : ""}
                            {posted.removed ? " · removed" : ""}
                            <div className="mt-0.5 line-clamp-2">{posted.body}</div>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card px-4 py-4">
            <div className="mb-3 text-sm font-medium">Details</div>
            <form action={savePerson} className="space-y-2.5">
              <input type="hidden" name="id" value={person.id} />
              <div>
                <label className="label">Name</label>
                <input name="displayName" defaultValue={person.displayName} className="input py-1 text-sm" />
              </div>
              <div>
                <label className="label">Stage</label>
                <select name="stage" defaultValue={person.stage} className="input py-1 text-sm">
                  {PERSON_STAGES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Account</label>
                <select name="accountId" defaultValue={person.accountId ?? ""} className="input py-1 text-sm">
                  <option value="">Unknown</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input name="newAccount" className="input mt-1.5 py-1 text-xs" placeholder="…or type a new company" />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea
                  name="notes"
                  rows={5}
                  defaultValue={person.notes}
                  className="input py-1 text-xs"
                  placeholder="What they told you about their setup, what they need, what they've already ruled out."
                />
              </div>
              <div className="flex justify-end">
                <button className="btn-primary px-3 py-1 text-xs">Save</button>
              </div>
            </form>
          </section>

          {channels.length > 0 && (
            <section className="card px-4 py-4">
              <div className="mb-1 text-sm font-medium">Where they show up</div>
              <div className="flex flex-wrap gap-1">
                {channels.map((c) => (
                  <span key={c} className="chip">
                    {c}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="card border-hot/20 px-4 py-4">
            <div className="mb-1 text-sm font-medium">Erase this person</div>
            <p className="mb-3 text-xs leading-relaxed text-ink-2">
              Deletes their identity and every link from a thread to them. The public threads themselves stay — those are a
              record of what was said in public, not a profile we assembled. Run this when someone asks you to.
            </p>
            <form action={forgetPerson.bind(null, person.id)}>
              <button className="btn-ghost px-2 py-1 text-xs text-hot">Erase</button>
            </form>
          </section>
        </aside>
      </div>
    </>
  );
}
