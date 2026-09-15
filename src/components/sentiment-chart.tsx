"use client";

import { useState } from "react";
import type { SentimentDay } from "@/lib/queries";

/**
 * Stacked daily sentiment (positive / neutral / negative). Sentiment is a
 * polarity, so it uses a diverging pair (blue ↔ red) with a neutral gray.
 */
const SERIES = [
  { key: "positive", label: "Positive", color: "var(--pos)" },
  { key: "neutral", label: "Neutral / mixed", color: "var(--neu)" },
  { key: "negative", label: "Negative", color: "var(--neg)" },
] as const;

export function SentimentChart({ data, title, width = 640 }: { data: SentimentDay[]; title: string; width?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = width;
  const H = 160;
  const padL = 28;
  const padB = 22;
  const padT = 8;
  const innerW = W - padL - 8;
  const innerH = H - padB - padT;
  const max = Math.max(1, ...data.map((d) => d.positive + d.neutral + d.negative));
  const slot = innerW / data.length;
  const barW = Math.min(28, slot * 0.6);
  const total = data.reduce((a, d) => a + d.positive + d.neutral + d.negative, 0);
  const ticks = max <= 4 ? [...Array(max + 1).keys()] : [0, Math.round(max / 2), max];

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-ink-3">
          {total} mention{total === 1 ? "" : "s"} · last {data.length} days
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${title}: daily sentiment counts`}>
          {ticks.map((t) => {
            const y = padT + innerH - (t / max) * innerH;
            return (
              <g key={t}>
                <line x1={padL} x2={W - 8} y1={y} y2={y} stroke="var(--hairline)" strokeWidth={1} />
                <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-3)">
                  {t}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const x = padL + i * slot + (slot - barW) / 2;
            let yCursor = padT + innerH;
            const segs = SERIES.map((s) => {
              const v = d[s.key];
              const h = (v / max) * innerH;
              yCursor -= h;
              return { ...s, v, y: yCursor, h };
            });
            const stackTotal = d.positive + d.neutral + d.negative;
            const dim = hover != null && hover !== i;
            return (
              <g
                key={d.day}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ opacity: dim ? 0.45 : 1, transition: "opacity 120ms" }}
              >
                {/* hit target larger than the mark */}
                <rect x={padL + i * slot} y={padT} width={slot} height={innerH} fill="transparent" />
                {segs.map((s, j) => {
                  if (s.v === 0) return null;
                  const isTop = segs.slice(j + 1).every((q) => q.v === 0);
                  const gap = j > 0 && segs.slice(0, j).some((q) => q.v > 0) ? 2 : 0;
                  const h = Math.max(0, s.h - gap);
                  return (
                    <rect
                      key={s.key}
                      x={x}
                      y={s.y}
                      width={barW}
                      height={h}
                      rx={isTop ? 4 : 0}
                      fill={s.color}
                    />
                  );
                })}
                {stackTotal === 0 && (
                  <line
                    x1={x}
                    x2={x + barW}
                    y1={padT + innerH}
                    y2={padT + innerH}
                    stroke="var(--hairline)"
                    strokeWidth={2}
                  />
                )}
                {((data.length - 1 - i) % 2 === 0 || data.length <= 8) && (
                  <text
                    x={x + barW / 2}
                    y={H - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--ink-3)"
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={padL} x2={W - 8} y1={padT + innerH} y2={padT + innerH} stroke="var(--neu)" strokeWidth={1} />
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-sm"
            style={{ left: `${Math.min(84, ((padL + hover * slot) / W) * 100)}%` }}
          >
            <div className="mb-1 font-medium">{data[hover].label}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-ink-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}: <span className="tabular-nums text-ink">{data[hover][s.key]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-ink-2">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
