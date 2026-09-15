import Link from "next/link";
import { logout } from "@/lib/auth-actions";
import type { SessionUser } from "@/lib/auth";

/** Who is signed in, and the way out. A form, so it works without JavaScript. */
export function UserMenu({ user }: { user: SessionUser }) {
  return (
    <div className="border-t border-hairline px-2 pt-3">
      <div className="truncate text-xs font-medium text-ink">{user.name || user.email}</div>
      <div className="truncate text-[11px] text-ink-3">{user.email}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <Link href="/settings/password" className="text-[11px] text-ink-3 hover:text-ink">
          Password
        </Link>
        <form action={logout}>
          <button className="text-[11px] text-ink-3 hover:text-ink">Sign out</button>
        </form>
      </div>
    </div>
  );
}
