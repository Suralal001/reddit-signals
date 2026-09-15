import Link from "next/link";
import { getActiveProject } from "@/lib/project";
import { listAccounts, listPeople, peopleStats, stageLabel, stageTone, suggestMerges, PERSON_STAGES } from "@/lib/people";
import { confirmMerge, saveAccount } from "@/lib/actions";
import { PLATFORM_META } from "@/lib/sources/types";
import { timeAgo, truncate } from "@/lib/util";
import { Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

type Search = { stage?: string; q?: string; account?: string };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const project = await getActiveProject();
  const stage = sp.stage && (sp.stage === "ALL" || PERSON_STAGES.some((s) => s.code === sp.stage)) ? sp.stage : "ALL";

  const [people, stats, accounts, merges] = await Promise.all([
    listPeople({ projectId: project.id, stage, q: sp.q?.trim() || undefined, accountId: sp.account || undefined }),
    peopleStats(project.id),
    listAccounts(project.id),
    suggestMerges(project.id, 12),
  ]);

  return (
    <>
      <PageHeader
        title="People"
        sub={`Every human ${project.name} has seen post, and everywhere they post. Built only from what they published under their own handle.`}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {PERSON_STAGES.map((s) => (
          <Link
            key={s.code}
            href={`/people?stage=${s.code}`}
            className={`card px-3 py-2.5 transition-colors hover:border-accent/40 ${stage === s.code ? "border-accent/50" : ""}`}
            title={s.desc}
          >
            <div className="text-lg font-semibold tabular-nums">{stats.byStage[s.code] ?? 0}</div>
            <div className="text-[11px] text-ink-3">{s.label}</div>
          </Link>
        ))}
      </div>

      <form className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3" method="get">
        <div>
          <label className="label">Stage</label>
          <select name="stage" defaultValue={stage} className="input w-40">
            <option value="ALL">All</option>
            {PERSON_STAGES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Account</label>
          <select name="account" defaultValue={sp.account ?? ""} className="input w-48">
            <option value="">Any</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a._count.people})
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-48 flex-1">
          <label className="label">Search</label>
          <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="handle, name or note" />
        </div>
        <button className="btn-secondary">Filter</button>
      </form>

      {merges.length > 0 && (
        <section className="card mb-6 px-5 py-4">
          <div className="mb-1 text-sm font-medium">Might be the same person</div>
          <p className="hint mb-3">
            Suggestions only — nothing is merged automatically. A wrong merge is hard to spot later, so read each one.
          </p>
          <ul className="divide-y divide-hairline">
            {merges.map((m) => (
              <li key={`${m.a.id}-${m.b.id}`} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className={`chip ${m.strength === "strong" ? "bg-warm-soft text-warm" : ""}`}>{m.strength}</span>
                <Link href={`/people/${m.a.id}`} className="text-sm font-medium hover:underline">
                  {PLATFORM_META[m.a.platform as keyof typeof PLATFORM_META]?.short ?? m.a.platform}/{m.a.handle}
                </Link>
                <span className="text-ink-3">·</span>
                <Link href={`/people/${m.b.id}`} className="text-sm font-medium hover:underline">
                  {PLATFORM_META[m.b.platform as keyof typeof PLATFORM_META]?.short ?? m.b.platform}/{m.b.handle}
                </Link>
                <span className="min-w-0 flex-1 text-xs text-ink-3">{m.reason}</span>
                <form action={confirmMerge.bind(null, m.a.id, m.b.id)}>
                  <button className="btn-ghost px-2 py-1 text-xs">Same person</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {people.length === 0 ? (
            <Empty
              title="Nobody yet"
              hint="People appear as the poller picks up threads. Everyone who has posted something you caught is here."
            />
          ) : (
            <ul className="card divide-y divide-hairline">
              {people.map((p) => (
                <li key={p.id} className="flex items-start gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/people/${p.id}`} className="font-medium hover:underline">
                        {p.displayName || "(no name)"}
                      </Link>
                      <span className={`chip ${stageTone(p.stage)}`}>{stageLabel(p.stage)}</span>
                      {p.handles.length > 1 && <span className="chip">{p.handles.length} accounts</span>}
                      {p.account && (
                        <Link href={`/people?account=${p.account.id}`} className="chip hover:underline">
                          {p.account.name}
                        </Link>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                      {p.handles.map((h) => (
                        <span key={h.id}>
                          <span className="text-ink-2">
                            {PLATFORM_META[h.platform as keyof typeof PLATFORM_META]?.short ?? h.platform}
                          </span>
                          /{h.handle}
                        </span>
                      ))}
                      <span>·</span>
                      <span>
                        {p._count.leads} thread{p._count.leads === 1 ? "" : "s"}
                      </span>
                      <span>last seen {timeAgo(p.lastSeenAt)}</span>
                    </div>
                    {p.notes && <p className="mt-1 text-xs text-ink-2">{truncate(p.notes, 160)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-4">
          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">Accounts</div>
            <p className="hint mb-3">Companies, filled in by hand or from what people say about themselves in public.</p>
            {accounts.length > 0 && (
              <ul className="mb-3 divide-y divide-hairline">
                {accounts.map((a) => (
                  <li key={a.id} className="py-2 text-sm">
                    <Link href={`/people?account=${a.id}`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                    <div className="text-xs text-ink-3">
                      {a._count.people} {a._count.people === 1 ? "person" : "people"}
                      {a.domain ? ` · ${a.domain}` : ""}
                      {a.segment ? ` · ${a.segment}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form action={saveAccount} className="space-y-2 border-t border-hairline pt-3">
              <input name="name" required className="input py-1 text-xs" placeholder="Company name" />
              <div className="flex gap-2">
                <input name="domain" className="input py-1 text-xs" placeholder="domain.com" />
                <input name="segment" className="input py-1 text-xs" placeholder="segment" />
              </div>
              <div className="flex justify-end">
                <button className="btn-secondary px-2 py-1 text-xs">Add account</button>
              </div>
            </form>
          </section>

          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">What this holds</div>
            <p className="text-xs leading-relaxed text-ink-2">
              The handle someone posts under, the display name it shows, a link to that public profile, and the threads of
              theirs we picked up. Nothing else. No email harvesting, no data-broker enrichment, no working out who an
              anonymous account belongs to — and every person here can be erased with one button on their page.
            </p>
          </section>

          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">Stages</div>
            <dl className="space-y-1.5 text-xs text-ink-2">
              {PERSON_STAGES.map((s) => (
                <div key={s.code}>
                  <dt className="font-medium text-ink">{s.label}</dt>
                  <dd>{s.desc}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}
