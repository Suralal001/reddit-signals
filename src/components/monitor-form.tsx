import { saveMonitor } from "@/lib/actions";
import { parseList } from "@/lib/util";
import { PLATFORMS, PLATFORM_META, parsePlatforms, parseSources } from "@/lib/sources/types";

type MonitorLike = {
  id: string;
  name: string;
  kind: string;
  keywords: string;
  subreddits: string;
  platforms?: string;
  sources?: string;
  scanComments: boolean;
  active: boolean;
};

export function MonitorForm({ monitor }: { monitor?: MonitorLike }) {
  const enabled = parsePlatforms(monitor?.platforms);
  const scopes = parseSources(monitor?.sources);
  return (
    <form action={saveMonitor} className="card px-5 py-4">
      {monitor && <input type="hidden" name="id" value={monitor.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <div>
          <label className="label" htmlFor="name">
            Name
          </label>
          <input id="name" name="name" required defaultValue={monitor?.name ?? ""} className="input" placeholder="e.g. Agency leads" />
        </div>
        <div>
          <label className="label" htmlFor="kind">
            Type
          </label>
          <select id="kind" name="kind" defaultValue={monitor?.kind ?? "LEAD"} className="input">
            <option value="LEAD">Lead — buying intent</option>
            <option value="BRAND">Brand — our mentions</option>
            <option value="COMPETITOR">Competitor — their mentions</option>
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="keywords">
            Keywords
          </label>
          <textarea
            id="keywords"
            name="keywords"
            rows={5}
            defaultValue={parseList(monitor?.keywords).join("\n")}
            className="input font-mono text-xs"
            placeholder={"one per line or comma-separated\nmulti-word phrases are searched as phrases"}
          />
          <p className="hint">Leave empty to watch every new post in the subreddits below.</p>
        </div>
        <div>
          <label className="label" htmlFor="subreddits">
            Subreddits
          </label>
          <textarea
            id="subreddits"
            name="subreddits"
            rows={5}
            defaultValue={parseList(monitor?.subreddits).join("\n")}
            className="input font-mono text-xs"
            placeholder={"startups\nSaaS\nEntrepreneur"}
          />
          <p className="hint">Leave empty to search all of Reddit (noisier).</p>
        </div>
      </div>

      <fieldset className="mt-5 border-t border-hairline pt-4">
        <legend className="sr-only">Sources</legend>
        <div className="label">Sources</div>
        <p className="hint mb-2.5">
          The same keywords run against every source you tick. Reddit is the only one this app can reply on; the rest are
          read, scored and drafted here, and answered in the browser.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {PLATFORMS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" name={`platform_${p}`} value="on" defaultChecked={enabled.includes(p)} />
              {PLATFORM_META[p].label}
              {!PLATFORM_META[p].canPost && <span className="chip">read</span>}
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {PLATFORMS.filter((p) => p !== "REDDIT").map((p) => (
            <div key={p}>
              <label className="label" htmlFor={`scope_${p}`}>
                {PLATFORM_META[p].scopeLabel}
              </label>
              <textarea
                id={`scope_${p}`}
                name={`scope_${p}`}
                rows={2}
                defaultValue={(scopes[p] ?? []).join("\n")}
                className="input font-mono text-xs"
              />
              <p className="hint">{PLATFORM_META[p].scopeHint}</p>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-5">
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="active" value="on" defaultChecked={monitor?.active ?? true} />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-2" title="Also keyword-match the newest comments in these subreddits (needs both keywords and subreddits).">
            <input type="checkbox" name="scanComments" value="on" defaultChecked={monitor?.scanComments ?? true} />
            Scan comments too
          </label>
        </div>
        <button className="btn-primary">{monitor ? "Save changes" : "Create monitor"}</button>
      </div>
    </form>
  );
}
