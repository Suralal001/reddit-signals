"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { testApifyActor } from "@/lib/actions";

type Sample = { title: string; body: string; author: string; url: string; when: string };

/**
 * A test run costs real Apify credit, so this is a button a person presses and
 * nothing else calls. It stores nothing — it exists to get the field mapping
 * right before a monitor starts writing rows from this actor.
 */
export function ApifyTest({ actorId, actorName }: { actorId: string; actorName: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string; sample?: Sample[] } | null>(null);
  const router = useRouter();

  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setResult(null);
              try {
                setResult(await testApifyActor(actorId));
              } catch (e) {
                setResult({ ok: false, message: (e as Error).message });
              }
              router.refresh();
            })
          }
        >
          {pending ? "Running…" : "Test run"}
        </button>
        <span className="text-[11px] text-ink-3">
          Runs {actorName} for up to 10 items and shows what maps. Costs one Apify run; stores nothing.
        </span>
      </div>

      {result && (
        <div
          className={`mt-2 rounded-lg px-3 py-2 text-xs leading-relaxed ${
            result.ok ? "bg-cool-soft text-ink-2" : "bg-hot-soft text-hot"
          }`}
        >
          {result.message}
        </div>
      )}

      {result?.sample && result.sample.length > 0 && (
        <ul className="mt-2 space-y-2">
          {result.sample.map((s, i) => (
            <li key={i} className="rounded-lg bg-surface-2 px-3 py-2 text-xs">
              <div className="font-medium text-ink">{s.title || <span className="text-hot">(no title mapped)</span>}</div>
              <div className="mt-0.5 text-ink-3">
                {s.author || <span className="text-hot">(no author)</span>} · {s.when}
                {s.url ? (
                  <>
                    {" · "}
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                      link ↗
                    </a>
                  </>
                ) : (
                  <span className="text-hot"> · no url mapped</span>
                )}
              </div>
              <div className="mt-1 text-ink-2">{s.body || <span className="text-hot">(no body mapped — the scorer would have nothing to read)</span>}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
