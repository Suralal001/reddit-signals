import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/project";
import { getSettings } from "@/lib/settings";
import { listOperators } from "@/lib/operators";
import { channelHealth, outreachBudget, CHANNEL_STATES, INCIDENT_KINDS, NO_ENGAGEMENT_NOTICE, type ChannelHealth } from "@/lib/moderation";
import { POLICIES } from "@/lib/playbook";
import { logChannelIncident, saveChannelStanding } from "@/lib/actions";
import { Empty, PageHeader } from "@/components/ui";
import { ClearCooldown, ModmailTool, ResolveIncident } from "@/components/channel-tools";
import { timeAgo } from "@/lib/util";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  good: "text-good",
  ok: "text-ink-2",
  warn: "text-warm",
  bad: "text-hot",
  muted: "text-ink-3",
};

/** Worst first. A page you only read the top of should put the danger there. */
const ORDER: Record<string, number> = {
  BANNED: 0,
  REFUSED: 1,
  ASK_PENDING: 2,
  UNVERIFIED: 3,
  WATCH_ONLY: 6,
  READ_ONLY: 5,
  CONDITIONAL: 4,
  APPROVED: 4,
};

function StateChip({ state }: { state: string }) {
  const meta = (CHANNEL_STATES as Record<string, { label: string; tone: string }>)[state];
  return <span className={`chip ${TONE[meta?.tone ?? "ok"]}`}>{meta?.label ?? state}</span>;
}

function ChannelRow({ c, operators }: { c: ChannelHealth; operators: { id: string; name: string }[] }) {
  const meta = (CHANNEL_STATES as Record<string, { short: string }>)[c.state];
  const paused = Boolean(c.cooldownUntil);
  const canAsk = !["REFUSED", "BANNED", "WATCH_ONLY"].includes(c.state);

  return (
    <details className="card group px-4 py-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-medium">r/{c.channel}</span>
        <StateChip state={c.state} />
        <span className="chip">{POLICIES[c.policy as keyof typeof POLICIES]?.label ?? c.policy}</span>
        {c.approvedUser && <span className="chip text-good">Approved user</span>}
        {paused && <span className="chip text-hot">Paused to {c.cooldownUntil!.toDateString()}</span>}
        {c.recheckOverdue && <span className="chip text-warm">Rules due a re-read</span>}
        <span className="ml-auto text-xs text-ink-3">
          {c.repliesPosted30d} replied
          {c.removed30d > 0 && <span className="ml-2 font-medium text-hot">{c.removed30d} removed</span>}
          {c.incidents30d > 0 && <span className="ml-2">· {c.incidents30d} incident{c.incidents30d === 1 ? "" : "s"}</span>}
        </span>
      </summary>

      <p className="mt-2 text-xs leading-snug text-ink-2">{meta?.short}</p>
      {paused && (
        <div className="mt-2 card border-hot/25 bg-hot-soft/30 px-3 py-2">
          <p className="text-xs leading-snug text-ink-2">{c.cooldownReason}</p>
          <ClearCooldown ruleId={c.id} channel={c.channel} />
        </div>
      )}
      {c.conditions && (
        <p className="mt-2 text-xs leading-snug text-ink-2">
          <span className="font-medium text-ink">Mods said:</span> {c.conditions}
        </p>
      )}

      <form action={saveChannelStanding} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="id" value={c.id} />
        <div>
          <label className="label">Standing</label>
          <select name="state" defaultValue={c.state} className="input">
            {Object.entries(CHANNEL_STATES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Promotion policy</label>
          <select name="policy" defaultValue={c.policy} className="input">
            {Object.entries(POLICIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Link to the rules</label>
          <input name="rulesUrl" className="input" defaultValue={c.rulesUrl} placeholder="https://reddit.com/r/…/about/rules" />
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label">What the mods permitted, in their words</label>
          <textarea name="conditions" className="input" rows={2} defaultValue={c.conditions} />
        </div>

        <div>
          <label className="label">Min account age AutoMod wants (days)</label>
          <input name="minAccountAgeDays" type="number" min={0} className="input" defaultValue={c.minAccountAgeDays ?? ""} placeholder="e.g. 30" />
          <p className="hint">AutoModerator removes silently below this. The comment looks posted to whoever wrote it.</p>
        </div>
        <div>
          <label className="label">Min comment karma</label>
          <input name="minCommentKarma" type="number" min={0} className="input" defaultValue={c.minCommentKarma ?? ""} placeholder="e.g. 50" />
        </div>
        <div>
          <label className="label">Brand mentions allowed per 30 days</label>
          <input name="mentionCap30d" type="number" min={0} className="input" defaultValue={c.mentionCap30d} />
        </div>

        <div>
          <label className="label">Flair required on brand comments</label>
          <input name="requiredFlair" className="input" defaultValue={c.requiredFlair} placeholder="e.g. Verified Brand" />
        </div>
        <div>
          <label className="label">Designated promo thread</label>
          <input name="promoThread" className="input" defaultValue={c.promoThread} placeholder="Weekly self-promo, Fridays" />
          <p className="hint">Set this and the brand name is blocked everywhere else in the community.</p>
        </div>
        <div>
          <label className="label">Moderators (public handles)</label>
          <input name="modHandles" className="input" defaultValue={c.modHandles.join(", ")} placeholder="u/name, u/name" />
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-3">
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" name="verified" defaultChecked={c.verified} /> I have read this sidebar myself
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" name="approvedUser" defaultChecked={c.approvedUser} /> We are an approved user here
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" name="linksAllowed" defaultChecked={c.linksAllowed} /> Links are allowed
          </label>
          <input name="verifiedBy" className="input max-w-[10rem] py-1 text-xs" placeholder="read by" defaultValue={c.verifiedBy} />
          <input name="recheckDays" type="number" min={7} className="input max-w-[8rem] py-1 text-xs" placeholder="re-read in 90 days" defaultValue={90} />
          <button className="btn-primary ml-auto">Save</button>
        </div>
      </form>

      <div className="mt-4 border-t border-hairline pt-3">
        <div className="mb-2 text-xs font-medium text-ink-2">
          Permission
          {c.outreachOutcome && (
            <span className="ml-2 font-normal text-ink-3">
              last request {c.outreachOutcome.toLowerCase()}
              {c.outreachSentAt ? ` · sent ${timeAgo(c.outreachSentAt)}` : ""}
            </span>
          )}
        </div>
        <ModmailTool ruleId={c.id} channel={c.channel} canAsk={canAsk} />
      </div>
    </details>
  );
}

export default async function ChannelsPage() {
  const project = await getActiveProject();
  const [channels, budget, settings, operators, incidents] = await Promise.all([
    channelHealth(project.id),
    outreachBudget(project.id),
    getSettings(project.id),
    listOperators(project.id),
    db.channelIncident.findMany({
      where: { projectId: project.id },
      orderBy: { at: "desc" },
      take: 25,
    }),
  ]);

  const sorted = [...channels].sort(
    (a, b) => (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9) || a.channel.localeCompare(b.channel),
  );
  const open = incidents.filter((i) => !i.resolvedAt);
  const halted = new Set(open.filter((i) => ["REMOVAL", "SHADOW_REMOVAL", "AUTOMOD_FILTER"].includes(i.kind)).map((i) => i.channel)).size >= 3;
  const paused = channels.filter((c) => c.cooldownUntil).length;
  const approved = channels.filter((c) => c.state === "APPROVED" || c.state === "CONDITIONAL").length;
  const unread = channels.filter((c) => c.state === "UNVERIFIED").length;

  return (
    <>
      <PageHeader
        title="Communities"
        sub={`${channels.length} on file · ${approved} where the mods have said yes · ${unread} sidebar${unread === 1 ? "" : "s"} still unread · ${budget.left} of ${budget.cap} permission requests left this week`}
      />

      {halted && (
        <section className="card mb-4 border-hot/40 bg-hot-soft/40 px-4 py-3">
          <div className="text-sm font-medium text-hot">Everything is paused.</div>
          <p className="mt-1 text-xs leading-snug text-ink-2">
            Three or more communities have removed something of ours in the last fortnight. That is a pattern rather than
            three mistakes, and the next thing at risk is {settings.brandDomain || "the domain"} itself — a domain filter
            applies everywhere at once and is lifted at Reddit&apos;s discretion, slowly. Read the removal reasons, close the
            incidents below, and only then start again.
          </p>
        </section>
      )}

      <section className="card mb-4 border-warm/30 bg-warm-soft/40 px-4 py-2.5">
        <p className="text-xs leading-snug text-ink-2">
          <span className="font-medium text-ink">Never engage with a colleague&apos;s comment.</span> {NO_ENGAGEMENT_NOTICE}
        </p>
      </section>

      <section className="mb-6 space-y-2">
        {sorted.length ? (
          sorted.map((c) => <ChannelRow key={c.id} c={c} operators={operators.map((o) => ({ id: o.id, name: o.name }))} />)
        ) : (
          <Empty
            title="No communities on file"
            hint="Load the project defaults from the Playbook page, or add channel rules there first."
          />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <h2 className="mb-2 text-sm font-medium">
            What moderators have done to us
            {paused > 0 && <span className="ml-2 text-xs font-normal text-hot">{paused} community paused</span>}
          </h2>
          {incidents.length ? (
            <ul className="card divide-y divide-hairline">
              {incidents.map((i) => (
                <li key={i.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium">r/{i.channel}</span>
                    <span className={`chip ${i.resolvedAt ? "" : "text-hot"}`}>
                      {INCIDENT_KINDS[i.kind as keyof typeof INCIDENT_KINDS] ?? i.kind}
                    </span>
                    <span className="ml-auto text-xs text-ink-3">{timeAgo(i.at)}</span>
                  </div>
                  {i.detail && <p className="mt-1 text-xs leading-snug text-ink-2">{i.detail}</p>}
                  {i.resolvedAt ? (
                    <p className="mt-1 text-xs text-ink-3">Closed: {i.resolvedNote}</p>
                  ) : (
                    <ResolveIncident id={i.id} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="Nothing has been removed"
              hint="Removals found by the poller land here automatically. Anything you hear about elsewhere — a modmail, a ban — log it on the right."
            />
          )}
        </section>

        <aside className="space-y-4">
          <form action={logChannelIncident} className="card space-y-3 px-4 py-3.5">
            <div className="text-sm font-medium">Log something that happened</div>
            <p className="text-xs leading-snug text-ink-3">
              Removals are detected automatically. Bans and modmail warnings are not — and a ban recorded here blocks
              every operator in that community, not just the account that was banned.
            </p>
            <div>
              <label className="label">Community</label>
              <input name="channel" className="input" placeholder="IndianSkincareAddicts" required />
            </div>
            <div>
              <label className="label">What happened</label>
              <select name="kind" className="input" defaultValue="MOD_WARNING">
                {Object.entries(INCIDENT_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Whose account</label>
              <select name="operatorId" className="input" defaultValue="">
                <option value="">Not specific to one person</option>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} (u/{o.handle})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Detail</label>
              <textarea name="detail" className="input" rows={3} placeholder="Paste the removal reason or the modmail." />
            </div>
            <button className="btn-primary w-full justify-center">Log it</button>
          </form>

          <section className="card px-4 py-3.5">
            <div className="mb-1.5 text-sm font-medium">The domain</div>
            <p className="text-xs leading-snug text-ink-2">
              {settings.brandDomain ? (
                <>
                  <span className="font-medium text-ink">{settings.brandDomain}</span> may go out{" "}
                  {settings.domainLinkCap7d} time{settings.domainLinkCap7d === 1 ? "" : "s"} a week across every community
                  combined. It is the only asset here shared by all of them, and the only one that cannot be replaced if
                  Reddit starts filtering it.
                </>
              ) : (
                <>No brand domain set. Add it in Settings so links to it can be budgeted across communities.</>
              )}
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
