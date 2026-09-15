"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pollNow } from "@/lib/actions";

export function PollButton({ className = "", projectName }: { className?: string; projectName?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className={className}>
      <button
        type="button"
        className="btn-secondary w-full justify-center"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            try {
              const r = await pollNow();
              setMsg(
                r.errors.length
                  ? `Finished with errors: ${r.errors[0]}`
                  : `${r.threadsSeen} items · ${r.newLeads} new · ${r.scored} scored${r.assigned ? ` · ${r.assigned} routed` : ""}${r.people ? ` · ${r.people} new people` : ""}${
                      Object.keys(r.byPlatform).length > 1
                        ? ` (${Object.entries(r.byPlatform)
                            .map(([p, n]) => `${p.slice(0, 2).toLowerCase()} ${n}`)
                            .join(", ")})`
                        : ""
                    }`,
              );
              router.refresh();
            } catch (e) {
              setMsg((e as Error).message);
            }
          })
        }
      >
        {pending ? "Polling sources…" : projectName ? `Poll ${projectName}` : "Poll now"}
      </button>
      {msg && <div className="mt-1.5 px-1 text-[11px] leading-snug text-ink-3">{msg}</div>}
    </div>
  );
}
