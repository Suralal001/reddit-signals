import { getPlaybook, listSubredditRules } from "@/lib/settings";
import { getActiveProject } from "@/lib/project";
import { deleteSubredditRule, loadProjectDefaults, savePlaybook, saveSubredditRule } from "@/lib/actions";
import { PLAYBOOK_FIELDS, POLICIES, SIGNALS, defaultsForSlug, playbookIsEmpty, type PolicyCode } from "@/lib/playbook";
import { PLATFORMS, PLATFORM_META, channelLabel } from "@/lib/sources/types";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PlaybookPage() {
  const project = await getActiveProject();
  const [playbook, rules] = await Promise.all([getPlaybook(project.id), listSubredditRules(project.id)]);
  const empty = playbookIsEmpty(playbook);
  const hasDefaults = defaultsForSlug(project.slug) !== null;

  return (
    <>
      <PageHeader
        title="Playbook"
        sub={`What the AI knows about ${project.name}, what it's allowed to say, and how each subreddit treats promotion.`}
        action={
          hasDefaults ? (
            <form action={loadProjectDefaults}>
              <button
                className="btn-secondary"
                title={`Overwrites the playbook and subreddit rules with the packaged ${project.name} defaults and upserts the researched monitors by name. Other projects are untouched.`}
              >
                {empty ? `Load ${project.name} defaults` : `Reload ${project.name} defaults`}
              </button>
            </form>
          ) : null
        }
      />

      {empty && (
        <div className="card mb-6 border-warm/30 bg-warm-soft px-4 py-3 text-sm text-ink-2">
          The playbook for {project.name} is empty, so drafts fall back to the short product description in Settings.{" "}
          {hasDefaults
            ? `Load the ${project.name} defaults to give the AI real substance, then edit anything that isn't true.`
            : "Fill in the fields below so the AI has real substance to work from."}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <form action={savePlaybook} className="card space-y-5 px-5 py-5">
          {PLAYBOOK_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={f.key}>
                {f.label}
              </label>
              <textarea id={f.key} name={f.key} rows={f.rows} defaultValue={playbook[f.key]} className="input font-sans text-[13px] leading-relaxed" />
              <p className="hint">{f.hint}</p>
            </div>
          ))}
          <div className="flex justify-end">
            <button className="btn-primary">Save playbook</button>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">Channel policies</div>
            <p className="hint mb-3">
              These apply to {project.name} only. The drafter and the pre-post lint follow them; subreddits not listed get <em>Disclose</em> by default. Unverified rows
              are conservative guesses — confirm against the sidebar before the first reply there.
            </p>
            {rules.length === 0 && (
              <p className="hint mb-3">No rules on file for {project.name} yet — every subreddit falls back to <em>Disclose</em>.</p>
            )}
            <ul className="divide-y divide-hairline">
              {rules.map((r) => (
                <li key={r.id} className="py-2.5">
                  <form action={saveSubredditRule} className="space-y-1.5">
                    <input type="hidden" name="name" value={r.name} />
                    <input type="hidden" name="platform" value={r.platform} />
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={PLATFORM_META[r.platform as keyof typeof PLATFORM_META]?.label}>
                        {channelLabel(r.platform, r.name)}
                      </span>
                      <select name="policy" defaultValue={r.policy} className="input w-32 py-1 text-xs">
                        {(Object.keys(POLICIES) as PolicyCode[]).map((p) => (
                          <option key={p} value={p}>
                            {POLICIES[p].label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <textarea name="notes" rows={2} defaultValue={r.notes} className="input py-1 text-xs" />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs text-ink-2">
                        <input type="checkbox" name="verified" value="on" defaultChecked={r.verified} />
                        Verified against sidebar
                      </label>
                      <div className="flex gap-1">
                        <button className="btn-ghost px-2 py-1 text-xs">Save</button>
                        <button formAction={deleteSubredditRule.bind(null, r.id)} className="btn-ghost px-2 py-1 text-xs text-hot">
                          Remove
                        </button>
                      </div>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
            <form action={saveSubredditRule} className="mt-3 space-y-1.5 border-t border-hairline pt-3">
              <select name="platform" defaultValue="REDDIT" className="input py-1 text-xs">
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_META[p].label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input name="name" placeholder="channel (subreddit, repo, tag)" className="input py-1 text-xs" required />
                <select name="policy" defaultValue="DISCLOSE" className="input w-32 py-1 text-xs">
                  {(Object.keys(POLICIES) as PolicyCode[]).map((p) => (
                    <option key={p} value={p}>
                      {POLICIES[p].label}
                    </option>
                  ))}
                </select>
              </div>
              <textarea name="notes" rows={2} placeholder="Rule text or notes" className="input py-1 text-xs" />
              <div className="flex justify-end">
                <button className="btn-secondary px-2 py-1 text-xs">Add channel</button>
              </div>
            </form>
          </section>

          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">Policy meanings</div>
            <dl className="space-y-1.5 text-xs text-ink-2">
              {(Object.keys(POLICIES) as PolicyCode[]).map((p) => (
                <div key={p}>
                  <dt className="font-medium text-ink">{POLICIES[p].label}</dt>
                  <dd>{POLICIES[p].short}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">Buying signals the scorer looks for</div>
            <ul className="space-y-1 text-xs text-ink-2">
              {SIGNALS.filter((s) => s.code !== "NONE").map((s) => (
                <li key={s.code}>
                  <span className={`font-medium ${s.hot ? "text-hot" : "text-ink"}`}>{s.label}</span> — {s.desc}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
