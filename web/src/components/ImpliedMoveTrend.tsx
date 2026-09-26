import { pct } from "@/lib/format";

/**
 * Average implied move across the week's reporters, plotted over recent weeks.
 * A soft-filled area with an emphasized endpoint — the "how big are earnings
 * moves being priced lately" trend. Pure SVG from real weekly averages; the
 * y-scale is derived from the data so the line uses the full height.
 *
 * `points[].value` is a fraction (0.094 = 9.4%); the last point is the current
 * week, labelled "now".
 */

const W = 560;
const H = 190;
const PAD = { top: 18, right: 14, bottom: 26, left: 40 };

export interface TrendPoint {
  label: string;
  value: number;
}

export function ImpliedMoveTrend({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) {
    return (
      <p className="px-3 py-10 text-center text-sm text-[var(--color-muted)]">
        Not enough recent history to chart yet.
      </p>
    );
  }

  const vals = points.map((p) => p.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 0.01;
  const yMin = Math.max(0, lo - span * 0.35);
  const yMax = hi + span * 0.35;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? 0 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(PAD.top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + plotH).toFixed(1)} Z`;

  // Four horizontal gridlines / y ticks across the scale.
  const ticks = [0, 1, 2, 3].map((k) => yMin + ((yMax - yMin) * k) / 3);

  // Label the first, a middle, and the last x-position to avoid crowding.
  const midIdx = Math.floor((points.length - 1) / 2);
  const lastIdx = points.length - 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Average implied move over the last ${points.length} weeks, ending at ${pct(points[lastIdx].value)}.`}
    >
      <defs>
        <linearGradient id="imt-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-viz-sma)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--color-viz-sma)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g fontSize="10" className="tnum" fill="var(--color-viz-axis)">
        {ticks.map((t, k) => (
          <g key={k}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-viz-grid)"
            />
            <text x={PAD.left - 7} y={y(t) + 3} textAnchor="end">
              {pct(t, 0)}
            </text>
          </g>
        ))}
      </g>

      <path d={area} fill="url(#imt-fill)" />
      <path
        d={line}
        fill="none"
        stroke="var(--color-viz-sma)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(lastIdx)}
        cy={y(points[lastIdx].value)}
        r="4.5"
        fill="var(--color-viz-sma)"
        stroke="var(--color-panel)"
        strokeWidth="2"
      />

      <g
        fontSize="9.5"
        fill="var(--color-viz-axis)"
        textAnchor="middle"
      >
        <text x={x(0)} y={H - 8} textAnchor="start">
          {points[0].label}
        </text>
        {midIdx !== 0 && midIdx !== lastIdx && (
          <text x={x(midIdx)} y={H - 8}>
            {points[midIdx].label}
          </text>
        )}
        <text x={x(lastIdx)} y={H - 8} textAnchor="end" fill="var(--color-viz-sma)">
          now
        </text>
      </g>
    </svg>
  );
}
