import { db } from "@/lib/db";
import { isMock, timeAgo } from "@/lib/util";
import { getActiveProjectId, listProjects } from "@/lib/project";
import { NavLink } from "./nav-link";
import { PollButton } from "./poll-button";
import { ProjectSwitcher } from "./project-switcher";
import { UserMenu } from "./user-menu";
import type { SessionUser } from "@/lib/auth";


const NAV = [
  { href: "/", label: "Dashboard", icon: "◎" },
  { href: "/leads", label: "Leads", icon: "◉" },
  { href: "/brand", label: "Brand & competitors", icon: "◈" },
  { href: "/replies", label: "Replies", icon: "↩" },
  { href: "/people", label: "People", icon: "☍" },
  { href: "/monitors", label: "Monitors", icon: "◇" },
  { href: "/apify", label: "Apify actors", icon: "⚗" },
  { href: "/operators", label: "Operators", icon: "☺" },
  { href: "/channels", label: "Communities", icon: "⌂" },
  { href: "/playbook", label: "Playbook", icon: "▤" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export async function Sidebar({ user }: { user: SessionUser }) {
  const activeId = await getActiveProjectId();
  const [lastRun, projects] = await Promise.all([
    // A cron sweep (projectId null) counts as a poll of every project.
    db.pollRun.findFirst({
      where: { OR: [{ projectId: activeId }, { projectId: null }] },
      orderBy: { startedAt: "desc" },
    }),
    listProjects(),
  ]);
  const active = projects.find((p) => p.id === activeId);
  const mock = isMock("REDDIT") || isMock("AI");

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-hairline bg-surface px-3 py-5">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm font-bold text-white">S</span>
        <div>
          <div className="text-sm font-semibold leading-tight">Reddit Signals</div>
          <div className="text-[11px] text-ink-3">{active ? active.name : "lead radar"}</div>
        </div>
      </div>

      {projects.length > 1 && (
        <ProjectSwitcher projects={projects.map((p) => ({ id: p.id, name: p.name }))} activeId={activeId} />
      )}

      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => (
          <NavLink key={n.href} href={n.href} icon={n.icon}>
            {n.label}
          </NavLink>
        ))}
        {user.role === "ADMIN" && (
          <NavLink href="/users" icon="⚿">
            People with access
          </NavLink>
        )}
      </nav>

      <div className="mt-auto space-y-3">
        {mock && (
          <div className="rounded-lg border border-warm/30 bg-warm-soft px-2.5 py-2 text-[11px] leading-snug text-ink-2">
            <span className="font-semibold text-ink">Mock mode.</span> Using fixture threads
            {isMock("AI") ? " and heuristic scoring" : ""}. Set credentials in <code>.env</code> to go live.
          </div>
        )}
        <PollButton projectName={active?.name} />
        <div className="px-2 text-[11px] text-ink-3">
          {lastRun ? (
            <>
              Last poll {timeAgo(lastRun.startedAt)}
              {lastRun.finishedAt ? ` · ${lastRun.newLeads} new` : " · running"}
              {lastRun.error ? <span className="text-hot"> · errors</span> : null}
            </>
          ) : (
            "No polls yet"
          )}
        </div>
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
