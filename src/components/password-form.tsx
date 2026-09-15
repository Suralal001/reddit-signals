"use client";

import { useActionState } from "react";
import { changeOwnPassword } from "@/lib/auth-actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, null);
  return (
    <form action={action} className="card space-y-3 px-4 py-4">
      <div>
        <label className="label" htmlFor="current">Current password</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="next">New password</label>
        <input id="next" name="next" type="password" autoComplete="new-password" required minLength={12} className="input" />
        <p className="hint">At least 12 characters. A passphrase of three or four unrelated words beats a short scramble.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">New password again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
      </div>
      {state?.error && <p className="text-xs leading-snug text-hot">{state.error}</p>}
      {state?.ok && <p className="text-xs leading-snug text-good">Changed. Other sessions on your account were signed out.</p>}
      <button className="btn-primary w-full justify-center" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
