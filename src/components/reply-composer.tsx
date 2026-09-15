"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateDraft, postReply, previewChannelGate } from "@/lib/actions";
import type { GateResult } from "@/lib/moderation";
import { redditUrl } from "@/lib/util";
import { lintHasBlock, lintReply, type LintContext } from "@/lib/lint";
import { POLICIES } from "@/lib/playbook";

export interface OperatorOption {
  id: string;
  name: string;
  handle: string;
  left: number;
  cap: number;
  risk: string;
  hasCredentials: boolean;
  warming: boolean;
}

/**
 * Draft → edit → post. The AI never posts on its own: the only path to Reddit
 * is the "Post reply" button, and it requires an explicit confirm.
 */
export function ReplyComposer({
  leadId,
  initialDraft,
  posted,
  replyingTo = "the post",
  lint,
  operators = [],
  assignedOperatorId = null,
  routingReason,
  lockReason,
  canPost = true,
  platformLabel = "Reddit",
}: {
  leadId: string;
  initialDraft: string;
  posted: { permalink: string; at: string; operatorName?: string | null } | null;
  replyingTo?: string;
  lint: Omit<LintContext, "authorAskedForTools">;
  operators?: OperatorOption[];
  assignedOperatorId?: string | null;
  routingReason?: string;
  lockReason?: string | null;
  canPost?: boolean;
  platformLabel?: string;
}) {
  const [text, setText] = useState(initialDraft);
  const [operatorId, setOperatorId] = useState<string>(
    assignedOperatorId ?? operators.find((o) => o.left > 0 && o.risk === "OK")?.id ?? operators[0]?.id ?? "",
  );
  const operator = operators.find((o) => o.id === operatorId) ?? null;
  const [steer, setSteer] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [askedForTools, setAskedForTools] = useState(false);
  const issues = lintReply(text, { ...lint, authorAskedForTools: askedForTools });
  const blocked = lintHasBlock(issues);
  const [error, setError] = useState<string | null>(null);
  // Standing with this community's moderators, checked against the text as it
  // is now. Shown before the confirm step rather than after the post fails.
  const [gate, setGate] = useState<GateResult | null>(null);
  const [override, setOverride] = useState("");
  const gateBlocks = gate?.findings.filter((f) => f.level === "block") ?? [];
  const gateWarns = gate?.findings.filter((f) => f.level === "warn") ?? [];
  const overrideOk = gateBlocks.length === 0 || override.trim().length >= 15;
  const [drafting, startDraft] = useTransition();
  const [posting, startPost] = useTransition();
  const router = useRouter();

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  if (posted) {
    return (
      <section className="card px-4 py-4">
        <div className="text-sm font-medium text-good">Reply posted</div>
        <div className="mt-1 text-xs text-ink-3">
          {posted.operatorName ? `${posted.operatorName} · ` : ""}
          {new Date(posted.at).toLocaleString()}
        </div>
        {posted.permalink && (
          <a href={redditUrl(posted.permalink)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent hover:underline">
            View comment on Reddit ↗
          </a>
        )}
      </section>
    );
  }

  return (
    <section className="card px-4 py-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">
          Reply <span className="font-normal text-ink-3">to {replyingTo}</span>
        </div>
        <div className="text-xs text-ink-3">{words} words</div>
      </div>

      <textarea
        className="input min-h-56 resize-y font-sans leading-relaxed"
        placeholder="Draft one with AI, or write your own."
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setConfirm(false);
        }}
      />

      <div className="mt-2 flex gap-2">
        <input
          className="input"
          placeholder="Optional steer, e.g. “shorter, mention the GitHub integration”"
          value={steer}
          onChange={(e) => setSteer(e.target.value)}
        />
        <button
          type="button"
          className="btn-secondary shrink-0"
          disabled={drafting || posting}
          onClick={() =>
            startDraft(async () => {
              setError(null);
              try {
                const r = await generateDraft(leadId, steer);
                setText(r.body);
                setConfirm(false);
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              }
            })
          }
        >
          {drafting ? "Drafting…" : text ? "Redraft" : "Draft with AI"}
        </button>
      </div>

      {issues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {issues.map((i) => (
            <li
              key={i.code}
              className={`rounded-lg px-3 py-1.5 text-xs ${i.level === "block" ? "bg-hot-soft text-hot" : "bg-warm-soft text-ink-2"}`}
            >
              <span className="font-medium">{i.level === "block" ? "Blocked: " : "Check: "}</span>
              {i.message}
            </li>
          ))}
        </ul>
      )}
      {lint.policy === "VALUE_ONLY" && (
        <label className="mt-2 flex items-center gap-2 text-xs text-ink-2">
          <input type="checkbox" checked={askedForTools} onChange={(e) => setAskedForTools(e.target.checked)} />
          The author explicitly asked for tool recommendations
        </label>
      )}

      {canPost && (
        <div className="mt-3 border-t border-hairline pt-3">
          <label className="label" htmlFor="operator">
            Replying as
          </label>
          {operators.length === 0 ? (
            <p className="text-xs text-ink-2">
              No {platformLabel} operator on file. Add the person who will reply on the Operators page — every comment goes
              out under a real name.
            </p>
          ) : (
            <>
              <select
                id="operator"
                className="input py-1 text-sm"
                value={operatorId}
                onChange={(e) => {
                  setOperatorId(e.target.value);
                  setConfirm(false);
                }}
              >
                {operators.map((o) => (
                  <option key={o.id} value={o.id} disabled={o.left <= 0 || o.risk === "LIKELY"}>
                    {o.name} (u/{o.handle}) — {o.left}/{o.cap} left today
                    {o.risk === "LIKELY" ? " · at risk" : o.risk === "WATCH" ? " · watch" : ""}
                    {o.warming ? " · warming up" : ""}
                  </option>
                ))}
              </select>
              {routingReason && <p className="hint mt-1">Suggested: {routingReason}</p>}
              {operator && !operator.hasCredentials && (
                <p className="mt-1 text-xs text-warm">
                  {operator.name} hasn&apos;t added their own credentials to <code>.env</code> yet, so posting will fail —
                  by design. Only they should type those.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {lockReason && (
        <div className="mt-3 rounded-lg bg-warm-soft px-3 py-2 text-xs leading-relaxed text-ink-2">{lockReason}</div>
      )}

      {!canPost && (
        <div className="mt-3 rounded-lg bg-cool-soft px-3 py-2 text-xs leading-relaxed text-ink-2">
          {platformLabel} replies aren&apos;t posted from this app. Copy the draft, open the thread, and reply from your own
          account — then mark the lead as replied.
        </div>
      )}

      {confirm && gate && gate.findings.length > 0 && (
        <div className={`mt-3 card px-3 py-2.5 ${gateBlocks.length ? "border-hot/30 bg-hot-soft/30" : "border-warm/30 bg-warm-soft/40"}`}>
          <div className="text-xs font-medium">
            {gateBlocks.length ? "This community says no" : "Worth knowing before you post"}
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {[...gateBlocks, ...gateWarns].map((f) => (
              <li key={f.code} className={`text-xs leading-snug ${f.level === "block" ? "text-hot" : "text-ink-2"}`}>
                {f.message}
              </li>
            ))}
          </ul>
          {gateBlocks.length > 0 && (
            <div className="mt-2.5">
              <label className="label">Why are you posting anyway?</label>
              <textarea
                className="input"
                rows={2}
                placeholder="Stored on the reply. The next person to look at this community will read it."
                value={override}
                onChange={(e) => setOverride(e.target.value)}
              />
              {!overrideOk && <p className="hint">A sentence, not a shrug.</p>}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {!confirm ? (
          <button
            type="button"
            className="btn-primary shrink-0 whitespace-nowrap"
            disabled={!text.trim() || posting || drafting || blocked || !canPost || !operatorId || Boolean(lockReason)}
            onClick={() =>
              startPost(async () => {
                setError(null);
                setOverride("");
                setGate(await previewChannelGate(leadId, operatorId, text));
                setConfirm(true);
              })
            }
            title={blocked ? "Fix the blocked issues first" : undefined}
          >
            {posting ? "Checking…" : "Post reply"}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn-primary"
              disabled={posting || !overrideOk}
              onClick={() =>
                startPost(async () => {
                  setError(null);
                  const r = await postReply(leadId, text, {
                    authorAskedForTools: askedForTools,
                    operatorId,
                    overrideReason: override.trim() || undefined,
                  });
                  if (r.ok) router.refresh();
                  else setError(r.error);
                  setConfirm(false);
                })
              }
            >
              {posting ? "Posting…" : gateBlocks.length ? "Post anyway" : operator ? `Yes, post as ${operator.name}` : "Yes, post as me"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirm(false)} disabled={posting}>
              Cancel
            </button>
          </>
        )}
        <span className="text-xs text-ink-3">
          {operator ? `Posts as u/${operator.handle}` : "Pick an operator"} · {POLICIES[lint.policy].label} policy here.
        </span>
      </div>

      {error && <div className="mt-2 rounded-lg bg-hot-soft px-3 py-2 text-xs text-hot">{error}</div>}
      <p className="mt-3 text-[11px] leading-snug text-ink-3">
        Disclose that you work on the product when you mention it; answer the question first. Reddit and most subs treat
        undisclosed promotion as spam.
      </p>
    </section>
  );
}
