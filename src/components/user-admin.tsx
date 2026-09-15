"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createUser,
  resetUserPassword,
  setUserDisabled,
  setUserRole,
  signOutEverywhere,
} from "@/lib/auth-actions";

interface Row {
  id: string;
  email: string;
  name: string;
  role: string;
  disabled: boolean;
  mustChange: boolean;
  lastLoginAt: string | null;
  sessions: number;
}

/**
 * A temporary password is shown exactly once, right here, and never stored in
 * readable form. There is no mail sender in this deployment, so the honest
 * design is to hand it over in person rather than to pretend an email went out.
 */
function OneTimeSecret({ email, secret }: { email: string; secret: string }) {
  return (
    <div className="card mt-3 border-warm/40 bg-warm-soft/40 px-3 py-2.5">
      <div className="text-xs font-medium text-ink">Temporary password for {email}</div>
      <code className="mt-1 block break-all font-mono text-sm">{secret}</code>
      <p className="mt-1.5 text-xs leading-snug text-ink-2">
        Give it to them directly. It is not stored anywhere and will not be shown again — they are forced to change it
        when they first sign in.
      </p>
    </div>
  );
}

export function UserAdmin({ users, meId }: { users: Row[]; meId: string }) {
  const [state, action, pending] = useActionState(createUser, null);
  const [reset, setReset] = useState<{ email: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section>
        <ul className="card divide-y divide-hairline">
          {users.map((u) => (
            <li key={u.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className={`font-medium ${u.disabled ? "text-ink-3 line-through" : ""}`}>
                  {u.name || u.email}
                </span>
                {u.name && <span className="text-xs text-ink-3">{u.email}</span>}
                {u.role === "ADMIN" && <span className="chip text-accent">Admin</span>}
                {u.disabled && <span className="chip text-hot">Disabled</span>}
                {u.mustChange && !u.disabled && <span className="chip text-warm">Must set a password</span>}
                <span className="ml-auto text-xs text-ink-3">
                  {u.lastLoginAt ? `last in ${new Date(u.lastLoginAt).toLocaleDateString()}` : "never signed in"}
                  {u.sessions > 0 && ` · ${u.sessions} session${u.sessions === 1 ? "" : "s"}`}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await resetUserPassword(u.id);
                      setReset({ email: r.email, secret: r.tempPassword });
                    })
                  }
                >
                  Reset password
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={busy || u.sessions === 0}
                  onClick={() => run(() => signOutEverywhere(u.id))}
                >
                  Sign out everywhere
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={busy}
                  onClick={() => run(() => setUserRole(u.id, u.role === "ADMIN" ? "MEMBER" : "ADMIN"))}
                >
                  {u.role === "ADMIN" ? "Make a member" : "Make an admin"}
                </button>
                <button
                  type="button"
                  className={`btn-ghost text-xs ${u.disabled ? "" : "text-hot"}`}
                  disabled={busy || (u.id === meId && !u.disabled)}
                  title={u.id === meId && !u.disabled ? "Locking yourself out is not a feature." : undefined}
                  onClick={() => run(() => setUserDisabled(u.id, !u.disabled))}
                >
                  {u.disabled ? "Re-enable" : "Disable"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {error && <p className="mt-2 text-xs leading-snug text-hot">{error}</p>}
        {reset && <OneTimeSecret email={reset.email} secret={reset.secret} />}
      </section>

      <aside>
        <form action={action} className="card space-y-3 px-4 py-3.5">
          <div className="text-sm font-medium">Add someone</div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" required />
          </div>
          <div>
            <label className="label">Name</label>
            <input name="name" className="input" placeholder="Shown on replies and overrides" />
          </div>
          <div>
            <label className="label">Role</label>
            <select name="role" className="input" defaultValue="MEMBER">
              <option value="MEMBER">Member — everything except managing people</option>
              <option value="ADMIN">Admin — can add and disable accounts</option>
            </select>
          </div>
          {state?.error && <p className="text-xs leading-snug text-hot">{state.error}</p>}
          <button className="btn-primary w-full justify-center" disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </button>
        </form>
        {state?.tempPassword && state.email && (
          <OneTimeSecret email={state.email} secret={state.tempPassword} />
        )}
      </aside>
    </div>
  );
}
