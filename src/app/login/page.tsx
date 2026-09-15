import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { countUsers } from "@/lib/auth-db";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getSessionUser()) redirect("/");
  const sp = await searchParams;
  // A fresh deployment with no accounts should say so rather than sit there
  // silently rejecting everything typed into it.
  const anyUsers = countUsers() > 0;

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <div className="mb-1 text-sm font-medium text-accent">Reddit Signals</div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-ink-2">DryDock AI workspace.</p>
        </div>

        {anyUsers ? (
          <LoginForm next={sp.next} />
        ) : (
          <div className="card px-4 py-3.5 text-sm leading-relaxed text-ink-2">
            <p className="font-medium text-ink">No accounts yet.</p>
            <p className="mt-1">
              Create the first admin on the server, then sign in:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs">
{`docker compose exec app node scripts/create-user.mjs \\
  you@neoito.com "Your Name" --admin`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
