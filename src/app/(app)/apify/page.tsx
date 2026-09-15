import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/project";
import { deleteApifyActor, saveApifyActor, toggleApifyActor } from "@/lib/actions";
import { DEFAULT_MAPPING, actorRisk, apifyConfigured, isDue } from "@/lib/sources/apify";
import { timeAgo } from "@/lib/util";
import { Empty, PageHeader } from "@/components/ui";
import { ApifyTest } from "@/components/apify-test";

export const dynamic = "force-dynamic";

type ActorRow = Awaited<ReturnType<typeof db.apifyActor.findMany>>[number];

export default async function ApifyPage() {
  const project = await getActiveProject();
  const actors = await db.apifyActor.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } });
  const configured = apifyConfigured();
  const runsPerDay = actors.filter((a) => a.active).reduce((sum, a) => sum + Math.min(a.maxRunsPerDay, Math.ceil(24 / a.cadenceHours)), 0);

  return (
    <>
      <PageHeader
        title="Apify actors"
        sub={`Sources the built-in adapters can't reach — X, review sites, YouTube comments, search results — reaching ${project.name}'s queue through Apify.`}
      />

      {!configured && (
        <div className="card mb-6 border-warm/30 bg-warm-soft px-4 py-3 text-sm text-ink-2">
          <span className="font-medium text-ink">No Apify token.</span> Add <code>APIFY_TOKEN</code> to <code>.env</code>{" "}
          (Apify Console → Settings → API &amp; Integrations) and restart. You can configure actors here meanwhile; nothing
          runs until the token is there.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {actors.length === 0 && (
            <Empty
              title="No actors configured"
              hint="Add one from the Apify Store. Start with competitor reviews — unhappy customers of Mem0, Zep or Glean are the highest-intent signal you have no other source for."
            />
          )}

          {actors.map((a) => {
            const due = isDue(a);
            const risk = actorRisk(a.actorId, a.name);
            const needsAck = risk.level === "ACKNOWLEDGE" && !a.riskAccepted;
            return (
              <section key={a.id} className={`card px-5 py-4 ${a.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <code className="chip font-mono">{a.actorId}</code>
                      {a.channel && <span className="chip">{a.channel}</span>}
                      {!a.active && <span className="chip">Paused</span>}
                      {risk.level === "BLOCKED" && <span className="chip bg-hot-soft text-hot">Blocked</span>}
                      {risk.level === "ACKNOWLEDGE" && (
                        <span className={`chip ${a.riskAccepted ? "bg-warm-soft text-warm" : "bg-hot-soft text-hot"}`}>
                          {a.riskAccepted ? "Risk accepted" : "Needs sign-off"}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
                      <span>every {a.cadenceHours}h</span>
                      <span>max {a.maxRunsPerDay}/day</span>
                      <span>{a.maxItems} items</span>
                      <span>{a.timeoutSecs}s timeout</span>
                      {a.lastRunAt ? (
                        <span>
                          last run {timeAgo(a.lastRunAt)} · {a.lastItems} items
                        </span>
                      ) : (
                        <span>never run</span>
                      )}
                      <span className={due.due ? "text-ink-2" : ""}>{due.due ? "due next poll" : due.why}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <form action={toggleApifyActor.bind(null, a.id)}>
                      <button className="btn-ghost px-2 py-1 text-xs">{a.active ? "Pause" : "Resume"}</button>
                    </form>
                    <form action={deleteApifyActor.bind(null, a.id)}>
                      <button className="btn-ghost px-2 py-1 text-xs text-hot">Remove</button>
                    </form>
                  </div>
                </div>

                {(risk.level === "BLOCKED" || needsAck) && (
                  <div className="mt-2.5 rounded-lg bg-hot-soft px-3 py-2 text-xs leading-relaxed text-hot">{risk.reason}</div>
                )}

                {a.lastError && !(needsAck && /risk accepted/i.test(a.lastError)) && (
                  <div className="mt-2.5 rounded-lg bg-hot-soft px-3 py-2 text-xs leading-relaxed text-hot">{a.lastError}</div>
                )}

                <ApifyTest actorId={a.id} actorName={a.name} />

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-ink-3 hover:text-accent">Edit</summary>
                  <ActorForm actor={a} />
                </details>
              </section>
            );
          })}

          <section className="card px-5 py-5">
            <div className="mb-1 text-sm font-medium">Add an actor</div>
            <p className="hint mb-3">
              Paste the store id from the actor&apos;s Apify page, then use Test run to get the mapping right before a
              monitor starts writing rows.
            </p>
            <ActorForm />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">What this costs</div>
            <p className="text-xs leading-relaxed text-ink-2">
              Apify bills per run: roughly $0.20 per compute unit (1 GB-hour) on the Free and Starter tiers, plus proxies
              and storage. Free gives $5 of usage a month, Starter $19. At your current settings this is up to{" "}
              <span className="font-medium text-ink">{runsPerDay} runs a day</span>. Cadence and the daily cap are checked
              before the request, not after — that is the difference between $19 lasting a month and lasting a morning.
            </p>
          </section>

          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">Worth starting with</div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-ink-2">
              <li>
                <span className="font-medium text-ink">Competitor reviews</span> — G2 and Capterra for Mem0, Zep, Glean,
                Langdock. Public, high-intent, and exactly the competitor-dissatisfaction signal you have no other source
                for.
              </li>
              <li>
                <span className="font-medium text-ink">X/Twitter search</span> — much of the agent-memory conversation
                lives there and there&apos;s no affordable API.
              </li>
              <li>
                <span className="font-medium text-ink">YouTube comments</span> — under competitor demos and conference
                talks.
              </li>
              <li>
                <span className="font-medium text-ink">Search and news</span> — brand and competitor mentions off-platform.
              </li>
            </ul>
          </section>

          <section className="card border-hot/20 px-4 py-4">
            <div className="mb-1 text-sm font-medium">Where the lines are</div>
            <ul className="space-y-2 text-xs leading-relaxed text-ink-2">
              <li>
                <span className="font-medium text-ink">Blocked, always.</span> Profile scrapers, employee listers, email
                and phone finders — on any platform, whoever signs off. Assembling a database of people is what actually
                draws litigation and it is the hard end of GDPR.
              </li>
              <li>
                <span className="font-medium text-ink">Needs sign-off.</span> LinkedIn content search. Reading public posts
                breaches LinkedIn&apos;s user agreement, and LinkedIn has won on that claim where X lost on the equivalent
                one. Your call to make — ticking <em>Risk accepted</em> records it.
              </li>
              <li>
                <span className="font-medium text-ink">Always on.</span> Anything shaped like an email address or phone
                number is stripped before storage, on every actor.
              </li>
              <li>
                <span className="font-medium text-ink">One actor, one monitor.</span> Cadence is per actor, so if two
                monitors point at the same actor only the first one&apos;s keywords are used.
              </li>
            </ul>
          </section>

          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">Template variables</div>
            <dl className="space-y-1 text-xs text-ink-2">
              <div>
                <dt className="font-mono text-ink">{"{{keywords}}"}</dt>
                <dd>The monitor&apos;s keywords as a JSON array.</dd>
              </div>
              <div>
                <dt className="font-mono text-ink">{"{{keywordsCsv}}"}</dt>
                <dd>The same, as one comma-separated string.</dd>
              </div>
              <div>
                <dt className="font-mono text-ink">{"{{since}}"}</dt>
                <dd>Lookback start as an ISO timestamp.</dd>
              </div>
              <div>
                <dt className="font-mono text-ink">{"{{sinceDate}}"}</dt>
                <dd>The same as YYYY-MM-DD.</dd>
              </div>
              <div>
                <dt className="font-mono text-ink">{"{{limit}}"}</dt>
                <dd>Max items.</dd>
              </div>
              <div>
                <dt className="font-mono text-ink">{"{{searchUrls}}"}</dt>
                <dd>The URL pattern above, expanded once per keyword.</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

function ActorForm({ actor }: { actor?: ActorRow }) {
  return (
    <form action={saveApifyActor} className="space-y-3">
      {actor && <input type="hidden" name="id" value={actor.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input name="name" required defaultValue={actor?.name ?? ""} className="input py-1 text-sm" placeholder="G2 reviews — Mem0" />
        </div>
        <div>
          <label className="label">Apify actor id</label>
          <input
            name="actorId"
            required
            defaultValue={actor?.actorId ?? ""}
            className="input py-1 font-mono text-xs"
            placeholder="username~actor-name"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_110px_110px_110px_110px]">
        <div>
          <label className="label">Channel</label>
          <input name="channel" defaultValue={actor?.channel ?? ""} className="input py-1 text-sm" placeholder="g2.com" />
        </div>
        <div>
          <label className="label">Every (h)</label>
          <input name="cadenceHours" type="number" min={1} max={720} defaultValue={actor?.cadenceHours ?? 24} className="input py-1 text-sm" />
        </div>
        <div>
          <label className="label">Runs/day</label>
          <input name="maxRunsPerDay" type="number" min={1} max={48} defaultValue={actor?.maxRunsPerDay ?? 2} className="input py-1 text-sm" />
        </div>
        <div>
          <label className="label">Max items</label>
          <input name="maxItems" type="number" min={1} max={1000} defaultValue={actor?.maxItems ?? 100} className="input py-1 text-sm" />
        </div>
        <div>
          <label className="label">Timeout (s)</label>
          <input name="timeoutSecs" type="number" min={30} max={290} defaultValue={actor?.timeoutSecs ?? 120} className="input py-1 text-sm" />
        </div>
      </div>

      <div>
        <label className="label">Search URL pattern</label>
        <input
          name="urlPattern"
          defaultValue={actor?.urlPattern ?? ""}
          className="input py-1 font-mono text-[11px]"
          placeholder="https://www.linkedin.com/search/results/content/?keywords={kw}&datePosted=%22past-week%22"
        />
        <p className="hint">
          Only for actors that take URLs instead of keywords. <code>{"{kw}"}</code> is replaced with each keyword,
          url-encoded, and the whole list becomes <code>{"{{searchUrls}}"}</code> in the template below.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <label className="label">Input template (JSON)</label>
          <textarea
            name="input"
            rows={7}
            defaultValue={actor?.input ?? '{\n  "searchTerms": {{keywords}},\n  "maxItems": {{limit}}\n}'}
            className="input font-mono text-[11px] leading-relaxed"
          />
          <p className="hint">Copy the actor&apos;s example input from its Apify page, then swap in the variables.</p>
        </div>
        <div>
          <label className="label">Field mapping (JSON)</label>
          <textarea
            name="mapping"
            rows={7}
            defaultValue={actor?.mapping ?? JSON.stringify(DEFAULT_MAPPING, null, 2)}
            className="input font-mono text-[11px] leading-relaxed"
          />
          <p className="hint">
            <code>|</code> separates fallbacks, <code>/</code> walks into nested objects. The defaults cover most actors.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="active" value="on" defaultChecked={actor?.active ?? true} />
            Active
          </label>
          <label
            className="flex items-center gap-2 text-sm text-ink-2"
            title="Required for LinkedIn content actors. Records that running this against a platform whose terms prohibit it is a deliberate decision."
          >
            <input type="checkbox" name="riskAccepted" value="on" defaultChecked={actor?.riskAccepted ?? false} />
            Risk accepted
          </label>
        </div>
        <button className="btn-primary px-3 py-1 text-sm">{actor ? "Save changes" : "Add actor"}</button>
      </div>
    </form>
  );
}
