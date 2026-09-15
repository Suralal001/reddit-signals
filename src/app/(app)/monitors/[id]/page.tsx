import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { deleteMonitor } from "@/lib/actions";
import { PageHeader } from "@/components/ui";
import { MonitorForm } from "@/components/monitor-form";

export const dynamic = "force-dynamic";

export default async function EditMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const monitor = await db.monitor.findUnique({ where: { id } });
  if (!monitor) notFound();

  return (
    <>
      <div className="mb-3 text-xs text-ink-3">
        <Link href="/monitors" className="hover:text-accent">
          ← Monitors
        </Link>
      </div>
      <PageHeader
        title={monitor.name}
        action={
          <form action={deleteMonitor.bind(null, monitor.id)}>
            <button className="btn-ghost text-hot">Delete monitor</button>
          </form>
        }
      />
      <MonitorForm monitor={monitor} />
      <p className="hint mt-3">Deleting a monitor also deletes its leads. Pausing keeps them.</p>
    </>
  );
}
