import { getSettings } from "@/lib/settings";
import { getActiveProject } from "@/lib/project";
import { saveSettings } from "@/lib/actions";
import { isMock, parseList } from "@/lib/util";
import { PageHeader } from "@/components/ui";
import { ConnectionTest } from "@/components/connection-test";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const project = await getActiveProject();
  const s = await getSettings(project.id);
  const redditConfigured = Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_USERNAME);
  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <>
      <PageHeader title={`Settings — ${project.name}`} sub="Who you are, what you sell, and how you sound. The AI reads all of this, per project." />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form action={saveSettings} className="card space-y-5 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="brandName">
                Brand name
              </label>
              <input id="brandName" name="brandName" defaultValue={s.brandName} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="competitors">
                Competitors
              </label>
              <input
                id="competitors"
                name="competitors"
                defaultValue={parseList(s.competitors).join(", ")}
                className="input"
                placeholder="comma-separated"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="productDesc">
              What you sell
            </label>
            <textarea id="productDesc" name="productDesc" rows={4} defaultValue={s.productDesc} className="input" />
            <p className="hint">Specific beats grand. What it does, what it plugs into, what it replaces.</p>
          </div>

          <div>
            <label className="label" htmlFor="audience">
              Who buys it
            </label>
            <textarea id="audience" name="audience" rows={2} defaultValue={s.audience} className="input" />
          </div>

          <div>
            <label className="label" htmlFor="voice">
              Voice
            </label>
            <textarea id="voice" name="voice" rows={3} defaultValue={s.voice} className="input" />
            <p className="hint">How replies should read. Paste a couple of your own Reddit comments here for a closer match.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="alertThreshold">
                Alert threshold
              </label>
              <input id="alertThreshold" name="alertThreshold" type="number" min={1} max={100} defaultValue={s.alertThreshold} className="input" />
              <p className="hint">Intent score that triggers an alert.</p>
            </div>
            <div>
              <label className="label" htmlFor="lookbackDays">
                Lookback (days)
              </label>
              <input id="lookbackDays" name="lookbackDays" type="number" min={1} max={30} defaultValue={s.lookbackDays} className="input" />
              <p className="hint">Ignore threads older than this.</p>
            </div>
            <div>
              <label className="label" htmlFor="dailyReplyCap">
                Daily reply cap
              </label>
              <input id="dailyReplyCap" name="dailyReplyCap" type="number" min={1} max={100} defaultValue={s.dailyReplyCap} className="input" />
              <p className="hint">Hard stop on posts per day from this account.</p>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="slackWebhook">
              Slack incoming webhook
            </label>
            <input id="slackWebhook" name="slackWebhook" defaultValue={s.slackWebhook} className="input" placeholder="https://hooks.slack.com/services/…" />
            <p className="hint">Hot leads, brand complaints and competitor openings land here.</p>
          </div>

          <div className="flex justify-end">
            <button className="btn-primary">Save settings</button>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="card px-4 py-4">
            <div className="mb-2 text-sm font-medium">Connections</div>
            <dl className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-ink-2">Reddit</dt>
                <dd className={isMock("REDDIT") ? "text-warm" : redditConfigured ? "text-good" : "text-hot"}>
                  {isMock("REDDIT") ? "Mock" : redditConfigured ? "Configured" : "Missing credentials"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ink-2">Anthropic</dt>
                <dd className={isMock("AI") ? "text-warm" : aiConfigured ? "text-good" : "text-hot"}>
                  {isMock("AI") ? "Mock" : aiConfigured ? "Configured" : "Missing API key"}
                </dd>
              </div>
            </dl>
            <ConnectionTest />
            <p className="hint mt-3">Credentials live in <code>.env</code>, never in the database. See README for the Reddit app setup.</p>
          </section>

          <section className="card px-4 py-4 text-xs leading-relaxed text-ink-2">
            <div className="mb-1 text-sm font-medium text-ink">House rules</div>
            Sonar reads Reddit through the official API and only posts when you press the button. It will not farm karma, send
            DMs, or post on a schedule — those get accounts banned and subreddits salted against your brand.
          </section>
        </aside>
      </div>
    </>
  );
}
