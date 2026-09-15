import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

/**
 * Everything behind the login. Middleware has already checked that the cookie
 * is signed; this is where the session is actually looked up, which is what
 * makes a disabled account or a revoked session take effect immediately.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <main className="min-w-0 flex-1 px-8 py-7">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
