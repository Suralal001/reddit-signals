import Link from "next/link";
import type { SignalSlice } from "@/lib/queries";

/**
 * What kind of conversations we're finding, ordered by volume.
 *
 * A horizontal bar list, not a pie: the job is comparing magnitudes across
 * twelve labelled categories, which a pie does badly and long category names
 * make worse. One hue for volume; the status colour marks the signals that
 * carry buying intent, because that is state rather than identity.
 *
 * Bars are 8px with a 4px rounded data-end and a square baseline, values ride
 * the tip, and the text stays in ink tokens.
 */
export function SignalMix({ slices, days = 14 }: { slices: SignalSlice[]; days?: number }) {
  const max = Math.max(...slices.map((s) => s.count), 1);
  const hotTotal = slices.filter((s) => s.hot).reduce((a, s) => a + s.count, 0);
  const total = slices.reduce((a, s) => a + s.count, 0);

  if (slices.length === 0) {
    return (
      <section className="card px-5 py-4">
        <h2 className="text-sm font-medium">Signal mix</h2>
        <p className="mt-2 text-xs text-ink-3">
          Nothing scored in the last {days} days. Signals appear once a poll has run and the scorer has read the threads.
        </p>
      </section>
    );
  }

  return (
    <section className="card px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium">Signal mix</h2>
        <span className="text-xs text-ink-3">
          {total} scored · last {days}d
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-3">
        {hotTotal > 0 ? (
          <>
            <span className="font-medium text-hot">{hotTotal}</span> of them carry buying intent.
          </>
        ) : (
          "None of them carry buying intent yet."
        )}
      </p>

      <ul className="mt-3 space-y-2.5">
        {slices.map((s) => (
          <li key={s.code}>
            <Link href={`/leads?signal=${s.code}&status=ALL`} className="group block">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-xs text-ink-2 group-hover:text-ink">{s.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-ink-3">{s.count}</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-r-[4px] bg-surface-2">
                <div
                  className={`h-full rounded-r-[4px] ${s.hot ? "bg-hot" : "bg-accent"}`}
                  style={{ width: `${Math.max(3, (s.count / max) * 100)}%` }}
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-4 border-t border-hairline pt-2.5 text-[11px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-hot" aria-hidden />
          Buying intent
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm bg-accent" aria-hidden />
          Context
        </span>
      </div>
    </section>
  );
}
