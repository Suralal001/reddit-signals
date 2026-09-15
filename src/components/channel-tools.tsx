"use client";

import { useState, useTransition } from "react";
import {
  clearChannelCooldown,
  markModmailSent,
  prepareModmail,
  recordModmailAnswer,
  resolveChannelIncident,
} from "@/lib/actions";

/**
 * The small interactive bits of the Communities page. Everything else is a plain
 * server-rendered form, because a page about being careful should not depend on
 * JavaScript having loaded.
 */

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="mt-2 text-xs leading-snug text-hot">{msg}</p>;
}

/** Draft a permission request, then hand it over for a human to send. */
export function ModmailTool({ ruleId, channel, canAsk }: { ruleId: string; channel: string; canAsk: boolean }) {
  const [draft, setDraft] = useState<{ id: string; subject: string; body: string; notes: string[] } | null>(null);
  const [sent, setSent] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  if (!draft) {
    return (
      <div>
        <button
          type="button"
          className="btn-secondary"
          disabled={!canAsk || pending}
          onClick={() => run(async () => setDraft(await prepareModmail(ruleId)))}
        >
          {pending ? "Drafting…" : "Draft a permission request"}
        </button>
        {!canAsk && (
          <p className="hint">
            Not while this community is refused or banned. A second ask is how a refusal becomes something worse.
          </p>
        )}
        <Err msg={error} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="label">Subject</span>
        <div className="card px-3 py-2 text-sm">{draft.subject}</div>
      </div>
      <div>
        <span className="label">Message — edit it before you send it</span>
        <textarea className="input font-mono text-xs" rows={16} defaultValue={draft.body} />
      </div>
      <ul className="space-y-1">
        {draft.notes.map((n) => (
          <li key={n} className="text-xs leading-snug text-ink-2">
            · {n}
          </li>
        ))}
      </ul>

      {!sent ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await markModmailSent(draft.id);
                setSent(true);
              })
            }
          >
            I&apos;ve sent this from my own account
          </button>
          <span className="text-xs text-ink-3">The app never messages anyone. This just records that you did.</span>
        </div>
      ) : (
        <div className="space-y-2">
          <span className="label">What did the mods say?</span>
          <textarea
            className="input"
            rows={3}
            placeholder="Paste their reply, or the conditions they set."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {(["APPROVED", "CONDITIONAL", "REFUSED", "NO_REPLY"] as const).map((o) => (
              <button
                key={o}
                type="button"
                className="btn-secondary"
                disabled={pending}
                onClick={() => run(async () => recordModmailAnswer(draft.id, o, answer))}
              >
                {o === "NO_REPLY" ? "No reply" : o.charAt(0) + o.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}
      <Err msg={error} />
    </div>
  );
}

/** Reopening a community that removed our comments should feel like a decision. */
export function ClearCooldown({ ruleId, channel }: { ruleId: string; channel: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-ghost text-xs" onClick={() => setOpen(true)}>
        Lift the pause
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      <textarea
        className="input"
        rows={2}
        placeholder={`What changed in r/${channel}? Read the removal reasons first.`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              try {
                await clearChannelCooldown(ruleId, note);
                setOpen(false);
              } catch (e) {
                setError((e as Error).message);
              }
            })
          }
        >
          Reopen r/{channel}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <Err msg={error} />
    </div>
  );
}

export function ResolveIncident({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  return (
    <div className="mt-1.5 flex gap-2">
      <input
        className="input py-1 text-xs"
        placeholder="What did you do about it?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button
        type="button"
        className="btn-ghost text-xs"
        disabled={pending || note.trim().length < 3}
        onClick={() => start(async () => resolveChannelIncident(id, note))}
      >
        Close
      </button>
    </div>
  );
}
