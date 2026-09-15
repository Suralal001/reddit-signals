"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setActiveProject } from "@/lib/actions";

export function ProjectSwitcher({
  projects,
  activeId,
}: {
  projects: { id: string; name: string }[];
  activeId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (projects.length <= 1) return null;

  return (
    <label className="mb-4 block px-2">
      <span className="mb-1 block text-[11px] font-medium text-ink-3">Project</span>
      <select
        value={activeId}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            await setActiveProject(e.target.value);
            router.refresh();
          })
        }
        className="input w-full text-sm"
        aria-label="Active project"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
