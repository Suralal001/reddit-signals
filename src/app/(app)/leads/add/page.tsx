import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/project";
import { addManualSignal } from "@/lib/actions";
import { PLATFORMS, PLATFORM_META } from "@/lib/sources/types";
import { platformReady } from "@/lib/sources";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AddSignalPage() {
  const project = await getActiveProject();
  const monitors = await db.monitor.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } });
  const linkedIn = platformReady("LINKEDIN");

  return (
    <>
      <div className="mb-3 text-xs text-ink-3">
        <Link href="/leads" className="hover:text-accent">
          ← Leads
        </Link>
      </div>
      <PageHeader
        title="Add a signal"
        sub={`Paste a thread you found yourself. It joins the ${project.name} queue like any other lead — scored, drafted against the playbook, routed to a person.`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form action={addManualSignal} className="card space-y-4 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div>
              <label className="label" htmlFor="platform">
                Platform
              </label>
              <select id="platform" name="platform" defaultValue="LINKEDIN" className="input">
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_META[p].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="url">
                Link
              </label>
              <input id="url" name="url" className="input" placeholder="https://www.linkedin.com/feed/update/…" />
              <p className="hint">Nothing is fetched from this link — it&apos;s so you can get back to the thread.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_180px_160px]">
            <div>
              <label className="label" htmlFor="title">
                Title or context
              </label>
              <input id="title" name="title" className="input" placeholder="What the post is about" />
            </div>
            <div>
              <label className="label" htmlFor="author">
                Author
              </label>
              <input id="author" name="author" className="input" placeholder="Their name or handle" />
            </div>
            <div>
              <label className="label" htmlFor="kind">
                Type
              </label>
              <select id="kind" name="kind" defaultValue="POST" className="input">
                <option value="POST">Post</option>
                <option value="COMMENT">Comment</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="body">
              The text
            </label>
            <textarea
              id="body"
              name="body"
              rows={10}
              required
              className="input font-sans text-[13px] leading-relaxed"
              placeholder="Paste the post or comment. This is what the scorer reads and what the draft answers, so paste all of it — including the part where they say what they actually need."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="channel">
                Channel
              </label>
              <input id="channel" name="channel" className="input" placeholder="linkedin.com" />
              <p className="hint">Which channel policy applies. Leave blank for the platform default.</p>
            </div>
            <div>
              <label className="label" htmlFor="monitorId">
                File under
              </label>
              <select id="monitorId" name="monitorId" defaultValue="" className="input">
                <option value="">Manual signals</option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button className="btn-primary">Add to the queue</button>
          </div>
        </form>

        <aside className="space-y-4">
          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">Why this exists</div>
            <p className="text-xs leading-relaxed text-ink-2">
              LinkedIn has no keyword search API — LinkedIn confirms there is no way to search public posts and comments
              for your org name, and scraping it is a contract breach that has ended companies. So discovery on LinkedIn
              is a person&apos;s job: you spot it in your feed or in Sales Navigator, and paste it here. Everything after
              that — scoring, the playbook draft, routing, the reply record — works the same as Reddit.
            </p>
          </section>

          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">LinkedIn ingestion</div>
            <p className="text-xs leading-relaxed text-ink-2">
              {linkedIn.ok
                ? "An automatic LinkedIn path is configured — Page mentions and comments on your own posts arrive on every poll. This form is for everything else."
                : linkedIn.reason}
            </p>
          </section>

          <section className="card px-4 py-4">
            <div className="mb-1 text-sm font-medium">Paste the whole thing</div>
            <p className="text-xs leading-relaxed text-ink-2">
              A truncated paste produces a confident draft answering a question nobody asked. If the thread has a reply
              that changes what they need, paste that too.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
