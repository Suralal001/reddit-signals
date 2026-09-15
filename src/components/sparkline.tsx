/**
 * Tiny trend line for a stat tile or channel card.
 *
 * Per the mark spec: 2px stroke with round joins, the line itself in a
 * de-emphasised tone so a grid of them stays quiet, and the current point in
 * the accent with a 2px surface ring so it stays legible where it sits on the
 * line. A flat series still draws a baseline rather than vanishing — "zero all
 * fortnight" is information, and an empty box reads as a rendering bug.
 */
export function Sparkline({
  values,
  width = 96,
  height = 24,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  label?: string;
}) {
  if (values.length < 2) return <span className="text-xs text-ink-3">–</span>;

  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / (values.length - 1);
  const y = (v: number) => (max === min ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2));
  const pts = values.map((v, i) => [pad + i * step, y(v)] as const);
  const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      preserveAspectRatio="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={d} fill="none" stroke="var(--neu)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}
