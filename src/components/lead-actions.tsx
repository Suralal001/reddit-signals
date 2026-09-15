"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLeadStatus } from "@/lib/actions";
import type { LeadStatus } from "@/lib/util";

export function LeadActions({ leadId, status }: { leadId: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = (s: LeadStatus) =>
    start(async () => {
      await setLeadStatus(leadId, s);
      router.refresh();
    });

  return (
    <div className="flex shrink-0 gap-2">
      {status !== "SAVED" && status !== "REPLIED" && (
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => go("SAVED")}>
          Save for later
        </button>
      )}
      {status !== "DISMISSED" ? (
        <button type="button" className="btn-ghost" disabled={pending} onClick={() => go("DISMISSED")}>
          Dismiss
        </button>
      ) : (
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => go("NEW")}>
          Restore
        </button>
      )}
    </div>
  );
}
