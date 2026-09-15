import Link from "next/link";
import { db } from "@/lib/db";
import { listLeads } from "@/lib/queries";
import { LEAD_STATUSES, MONITOR_KINDS, type LeadStatus, type MonitorKind } from "@/lib/util";
import { Empty, LeadRow, PageHeader } from "@/components/ui";
import { SIGNALS } from "@/lib/playbook";
import { isPlatform, PLATFORMS, PLATFORM_META } from "@/lib/sources/types";

export const dynamic = "force-dynamic";

type Search = { monitor?: string; kind?: string; status?: string; min?: string; q?: string; signal?: string; platform?: string; channel?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = (LEAD_STATUSES as readonly string[]).includes(sp.status ?? "") || sp.status === "ALL" ? (sp.status as LeadStatus | "ALL") : "NEW";
  const kind = (MONITOR_KINDS as readonly string[]).includes(sp.kind ?? "") ? (sp.kind as MonitorKind) : undefined;
  const minScore = sp.min ? Number(sp.min) || 0 : 0;
  const signal = SIGNALS.some((s) => s.code === sp.signal) ? sp.signal : undefined;
  const platform = sp.platform && isPlatform(sp.platform) ? sp.platform : undefined;
  const channel = sp.channel?.trim() || undefined;

  const [monitors, { leads }] = await Promise.all([
    db.monitor.findMany({ orderBy: { name: "asc" } }),
    listLeads({ monitorId: sp.monitor || undefined, kind, status, minScore, q: sp.q?.trim() || undefined, signal, platform, channel }),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        sub="Every thread a monitor picked up, ranked by intent."
        action={
          <Link href="/leads/add" className="btn-secondary">
            Add a signal
          </Link>
        }
      />

      <form className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-3" method="get">
        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={status} className="input w-36">
            {["NEW", "SAVED", "REPLIED", "DISMISSED", "ALL"].map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Source</label>
          {channel && <input type="hidden" name="channel" value={channel} />}
          <select name="platform" defaultValue={platform ?? ""} className="input w-40">
            <option value="">All channels</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_META[p].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type</label>
          <select name="kind" defaultValue={kind ?? ""} className="input w-36">
            <option value="">All types</option>
            <option value="LEAD">Leads</option>
            <option value="BRAND">Brand</option>
            <option value="COMPETITOR">Competitor</option>
          </select>
        </div>
        <div>
          <label className="label">Monitor</label>
          <select name="monitor" defaultValue={sp.monitor ?? ""} className="input w-52">
            <option value="">All monitors</option>
            {monitors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Signal</label>
          <select name="signal" defaultValue={signal ?? ""} className="input w-44">
            <option value="">Any signal</option>
            {SIGNALS.filter((s) => s.code !== "NONE").map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Min score</label>
          <input name="min" type="number" min={0} max={100} defaultValue={minScore || ""} className="input w-24" placeholder="0" />
        </div>
        <div className="min-w-48 flex-1">
          <label className="label">Search</label>
          <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="Title or body contains…" />
        </div>
        <button className="btn-secondary">Filter</button>
      </form>

      {leads.length ? (
        <ul className="card divide-y divide-hairline">
          {leads.map((l) => (
            <LeadRow key={l.id} lead={l} />
          ))}
        </ul>
      ) : (
        <Empty title="No leads match" hint="Loosen the filters, or run a poll." />
      )}
    </>
  );
}
