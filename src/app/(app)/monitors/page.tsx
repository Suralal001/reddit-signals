import Link from "next/link";
import { listMonitorsWithCounts } from "@/lib/queries";
import { toggleMonitor } from "@/lib/actions";
import { parseList } from "@/lib/util";
import { KindChip, PageHeader } from "@/components/ui";
import { PLATFORM_META, parsePlatforms, parseSources } from "@/lib/sources/types";
import { MonitorForm } from "@/components/monitor-form";

export const dynamic = "force-dynamic";

export default async function MonitorsPage() {
  const monitors = await listMonitorsWithCounts();

  return (
    <>
      <PageHeader title="Monitors" sub="What Sonar watches for, and where. Each poll runs every active monitor against every source it's ticked for." />

      {monitors.length > 0 && (
        <ul className="card mb-8 divide-y divide-hairline">
          {monitors.map((m) => {
            const kws = parseList(m.keywords);
            const subs = parseList(m.subreddits);
            const platforms = parsePlatforms(m.platforms);
            const scopes = parseSources(m.sources);
            return (
              <li key={m.id} className={`flex items-start gap-4 px-5 py-4 ${m.active ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/monitors/${m.id}`} className="font-medium hover:underline">
                      {m.name}
                    </Link>
                    <KindChip kind={m.kind} />
                    {platforms.map((p) => (
                      <span key={p} className="chip" title={PLATFORM_META[p].canPost ? undefined : "Read-only source"}>
                        {PLATFORM_META[p].label}
                      </span>
                    ))}
                    {!m.active && <span className="chip">Paused</span>}
                  </div>
                  <div className="mt-1 text-xs text-ink-3">
                    {kws.length ? `${kws.length} keyword${kws.length === 1 ? "" : "s"}` : "all posts"}
                    {platforms.includes("REDDIT") && (
                      <>
                        {" "}
                        in {subs.length ? subs.map((s) => `r/${s}`).join(", ") : "all of Reddit"}
                        {m.scanComments && kws.length > 0 && subs.length > 0 ? " · posts + comments" : " · posts only"}
                      </>
                    )}
                    {platforms
                      .filter((p) => p !== "REDDIT")
                      .map((p) => (
                        <span key={p}>
                          {" · "}
                          {PLATFORM_META[p].label}
                          {(scopes[p] ?? []).length ? ` (${(scopes[p] ?? []).join(", ")})` : ""}
                        </span>
                      ))}
                  </div>
                  {kws.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {kws.slice(0, 8).map((k) => (
                        <span key={k} className="chip">
                          {k}
                        </span>
                      ))}
                      {kws.length > 8 && <span className="chip">+{kws.length - 8}</span>}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs text-ink-3">
                  <div>
                    <span className="text-base font-semibold text-ink">{m.open}</span> open
                  </div>
                  <div>{m.total} total</div>
                </div>
                <form action={toggleMonitor.bind(null, m.id)}>
                  <button className="btn-ghost text-xs">{m.active ? "Pause" : "Resume"}</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mb-2 text-sm font-medium">New monitor</h2>
      <MonitorForm />
    </>
  );
}
