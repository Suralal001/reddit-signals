import { getActiveProject } from "@/lib/project";
import { capacities, listOperators, operatorEnvNames, operatorHasCredentials, riskTone } from "@/lib/operators";
import { deleteOperator, runAllOperatorChecks, runOperatorCheck, saveOperator, toggleOperator } from "@/lib/actions";
import { PLATFORMS, PLATFORM_META } from "@/lib/sources/types";
import { parseList, timeAgo } from "@/lib/util";
import { Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OperatorsPage() {
  const project = await getActiveProject();
  const [operators, caps] = await Promise.all([listOperators(project.id), capacities(project.id)]);
  const totalCap = operators.filter((o) => o.active).reduce((a, o) => a + o.dailyCap, 0);

  return (
    <>
      <PageHeader
        title="Operators"
        sub={`The real, named people who reply for ${project.name}. One row per person per platform — never a persona, never a second account for the same human.`}
        action={
          operators.length ? (
            <form action={runAllOperatorChecks}>
              <button className="btn-secondary" title="Public karma lookup, removal rate and a shadowban probe for every operator.">
                Check all accounts
              </button>
            </form>
          ) : null
        }
      />

      <div className="card mb-6 border-accent/20 bg-accent-soft/40 px-4 py-3 text-sm leading-relaxed text-ink-2">
        <span className="font-medium text-ink">How this scales, and how it doesn&apos;t.</span> Ingestion and drafting are
        unlimited — add every monitor and platform you want. Posting is capped per person on purpose: a hundred accounts
        posting the same niche topic is the single easiest pattern for a platform to detect, and the penalty is a
        site-wide domain ban that also removes genuine mentions of {project.name} from customers. Capacity here is{" "}
        <span className="font-medium text-ink">{totalCap} replies a day</span> across {operators.filter((o) => o.active).length}{" "}
        active {operators.filter((o) => o.active).length === 1 ? "account" : "accounts"} — every one of them visible, which
        a hundred shadowbanned accounts would not be.
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          {operators.length === 0 && (
            <Empty
              title="No operators yet"
              hint="Add the people who will actually reply — their own accounts, their own names. Drafts have nowhere to go until then."
            />
          )}

          {operators.map((o) => {
            const cap = caps.get(o.id);
            const tone = riskTone(o.shadowbanRisk);
            const meta = PLATFORM_META[o.platform as keyof typeof PLATFORM_META];
            const creds = operatorHasCredentials(o);
            const warming = o.warmedUntil && o.warmedUntil > new Date();
            return (
              <section key={o.id} className={`card px-5 py-4 ${o.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{o.name}</span>
                      <span className="chip">{meta?.label ?? o.platform}</span>
                      <span className="text-sm text-ink-2">{o.platform === "REDDIT" ? `u/${o.handle}` : o.handle}</span>
                      <span className={`chip ${tone.cls}`}>{tone.label}</span>
                      {!o.active && <span className="chip">Paused</span>}
                      {warming && <span className="chip bg-warm-soft text-warm">Warming up</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
                      <span>
                        {cap?.used ?? 0} / {o.dailyCap} today
                      </span>
                      {o.karma != null && <span>{o.karma.toLocaleString()} karma</span>}
                      {o.accountAgeDays != null && <span>{o.accountAgeDays}d old</span>}
                      {o.lastPostedAt && <span>last reply {timeAgo(o.lastPostedAt)}</span>}
                      {o.lastCheckedAt && <span>checked {timeAgo(o.lastCheckedAt)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <form action={runOperatorCheck.bind(null, o.id)}>
                      <button className="btn-ghost px-2 py-1 text-xs">Check</button>
                    </form>
                    <form action={toggleOperator.bind(null, o.id)}>
                      <button className="btn-ghost px-2 py-1 text-xs">{o.active ? "Pause" : "Resume"}</button>
                    </form>
                    <form action={deleteOperator.bind(null, o.id)}>
                      <button className="btn-ghost px-2 py-1 text-xs text-hot">Remove</button>
                    </form>
                  </div>
                </div>

                {o.healthNote && (
                  <p className={`mt-2.5 text-sm leading-relaxed ${o.shadowbanRisk === "OK" ? "text-ink-3" : "text-ink-2"}`}>
                    {o.healthNote}
                  </p>
                )}

                {parseList(o.expertise).length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {parseList(o.expertise).map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {o.platform === "REDDIT" && (
                  <p className="mt-2.5 text-xs text-ink-3">
                    {creds ? (
                      <>Credentials configured — this app can post as {o.name}.</>
                    ) : (
                      <>
                        No credentials yet. {o.name} adds{" "}
                        <code>{(operatorEnvNames(o.envKey || "KEY")[0] ?? "REDDIT_OP_KEY_CLIENT_ID").replace("_CLIENT_ID", "_*")}</code>{" "}
                        to <code>.env</code> themselves — nobody else types their password. Until then their drafts wait here.
                      </>
                    )}
                  </p>
                )}
                {o.platform !== "REDDIT" && (
                  <p className="mt-2.5 text-xs text-ink-3">
                    {meta?.label} replies are posted in the browser, signed in as {o.name}. The app drafts and tracks; it
                    doesn&apos;t post there.
                  </p>
                )}

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-ink-3 hover:text-accent">Edit</summary>
                  <OperatorForm operator={o} />
                </details>
              </section>
            );
          })}
        </div>

        <aside className="space-y-4">
          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">Add an operator</div>
            <p className="hint mb-3">
              A person, on one platform, under the account they already use. If someone works both Reddit and HN, add two
              rows — one per platform, same name.
            </p>
            <OperatorForm />
          </section>

          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">What the caps are for</div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-ink-2">
              <li>
                <span className="font-medium text-ink">Daily cap</span> — the most replies this person posts in a day. Three
                is a person having a conversation; fifteen is a job.
              </li>
              <li>
                <span className="font-medium text-ink">Warm-up</span> — while set, the account can reply but cannot name the
                product. Four to six weeks of real participation is what gets past subreddit karma gates.
              </li>
              <li>
                <span className="font-medium text-ink">Expertise</span> — channels this person is credible in. The router
                sends leads there first.
              </li>
              <li>
                <span className="font-medium text-ink">Health</span> — karma, removal rate, and a public-profile probe. On
                Reddit a 404 on the profile while the account still works when logged in is the classic shadowban tell.
              </li>
            </ul>
          </section>

          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">Thread rules, enforced</div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-ink-2">
              <li>One reply per thread, ever.</li>
              <li>Never two operators in the same thread — that is the brigading pattern.</li>
              <li>An account flagged <em>At risk</em> cannot post until it&apos;s cleared.</li>
              <li>Every reply is approved by the person whose name is on it.</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

function OperatorForm({
  operator,
}: {
  operator?: {
    id: string;
    name: string;
    platform: string;
    handle: string;
    envKey: string;
    dailyCap: number;
    expertise: string;
    notes: string;
    active: boolean;
    warmedUntil: Date | null;
  };
}) {
  return (
    <form action={saveOperator} className="space-y-2.5">
      {operator && <input type="hidden" name="id" value={operator.id} />}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">Person</label>
          <input name="name" required defaultValue={operator?.name ?? ""} className="input py-1 text-sm" placeholder="Oliver" />
        </div>
        <div>
          <label className="label">Platform</label>
          <select name="platform" defaultValue={operator?.platform ?? "REDDIT"} className="input py-1 text-sm">
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_META[p].label}
                {PLATFORM_META[p].canPost ? "" : " (drafts only)"}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">Handle</label>
          <input name="handle" required defaultValue={operator?.handle ?? ""} className="input py-1 text-sm" placeholder="oliver_c" />
        </div>
        <div>
          <label className="label">Env key</label>
          <input
            name="envKey"
            defaultValue={operator?.envKey ?? ""}
            className="input py-1 font-mono text-xs"
            placeholder="OLIVER"
            title="Suffix for REDDIT_OP_<KEY>_CLIENT_ID etc. Reddit only."
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="label">Replies per day</label>
          <input name="dailyCap" type="number" min={1} max={20} defaultValue={operator?.dailyCap ?? 3} className="input py-1 text-sm" />
        </div>
        <div>
          <label className="label">Warm-up (days)</label>
          <input name="warmupDays" type="number" min={0} max={120} placeholder="0" className="input py-1 text-sm" />
        </div>
      </div>
      <div>
        <label className="label">Credible in</label>
        <textarea
          name="expertise"
          rows={2}
          defaultValue={parseList(operator?.expertise).join("\n")}
          className="input py-1 font-mono text-xs"
          placeholder={"LocalLLaMA\nRag\nlangchain"}
        />
      </div>
      <div>
        <label className="label">Notes</label>
        <textarea name="notes" rows={2} defaultValue={operator?.notes ?? ""} className="input py-1 text-xs" placeholder="Who they are in the community, what they can speak to." />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" name="active" value="on" defaultChecked={operator?.active ?? true} />
            Active
          </label>
          {operator?.warmedUntil && (
            <label className="flex items-center gap-1.5 text-xs text-ink-2">
              <input type="checkbox" name="clearWarmup" value="on" />
              End warm-up
            </label>
          )}
        </div>
        <button className="btn-secondary px-2 py-1 text-xs">{operator ? "Save" : "Add operator"}</button>
      </div>
    </form>
  );
}
