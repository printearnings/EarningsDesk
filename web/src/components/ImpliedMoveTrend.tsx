import { pctRange } from "@/lib/format";

/**
 * Average implied move across each week's reporters, over recent weeks: the
 * "how big are earnings moves being priced lately" trend.
 *
 * The curve is a monotone cubic (Fritsch-Carlson). It reads as smooth as a
 * spline but never overshoots the data, so the line can't dip below or
 * peak above a week that was actually measured. A plain Catmull-Rom or
 * Bezier through three points happily invents a trough that never happened.
 *
 * The first, last, highest and lowest weeks carry their value, so the
 * chart reads without hovering. `points[].value` is a fraction (0.094 = 9.4%);
 * the last point is the current week, labelled "now".
 */

const W = 640;
const H = 250;
const PAD = { top: 30, right: 24, bottom: 30, left: 24 };

export interface TrendPoint {
  label: string;
  value: number;
}

/** Monotone cubic path through (x, y) screen points. */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n < 2) return "";
  if (n === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  m.push(slope[n - 2]);
  // Fritsch-Carlson: clamp tangents so each segment stays monotone.
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }

  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (m[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (m[i + 1] * dx[i]) / 3;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
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
  const yMin = Math.max(0, lo - span * 0.45);
  const yMax = hi + span * 0.35;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const screen = points.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const line = monotonePath(screen);
  const baseY = PAD.top + plotH;
  const area = `${line} L${screen[screen.length - 1].x.toFixed(1)},${baseY} L${screen[0].x.toFixed(1)},${baseY} Z`;

  const lastIdx = points.length - 1;
  const hiIdx = vals.indexOf(hi);
  const loIdx = vals.indexOf(lo);
  const labelled = [...new Set([0, hiIdx, loIdx, lastIdx])];
  const midIdx = Math.floor(lastIdx / 2);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={`Average implied move over the last ${points.length} weeks, from ${pctRange(points[0].value)} to ${pctRange(points[lastIdx].value)} now.`}
    >
      <defs>
        <linearGradient id="imt-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-viz-price)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-viz-price)" stopOpacity="0" />
        </linearGradient>
        <filter id="imt-glow" x="-10%" y="-30%" width="120%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + f * plotH}
          y2={PAD.top + f * plotH}
          stroke="var(--color-viz-grid)"
          strokeDasharray="3 4"
        />
      ))}
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={baseY}
        y2={baseY}
        stroke="var(--color-viz-grid)"
      />

      <path d={area} fill="url(#imt-fill)" />
      <path
        d={line}
        fill="none"
        stroke="var(--color-viz-price)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#imt-glow)"
      />

      {screen.map((pt, i) => (
        <circle
          key={i}
          cx={pt.x}
          cy={pt.y}
          r={i === lastIdx ? 5.5 : labelled.includes(i) ? 3.5 : 2.5}
          fill="var(--color-viz-price)"
          stroke="var(--color-panel)"
          strokeWidth={i === lastIdx ? 2.5 : 1.5}
        />
      ))}
      <circle
        cx={screen[lastIdx].x}
        cy={screen[lastIdx].y}
        r="11"
        fill="var(--color-viz-price)"
        fillOpacity="0.15"
      />

      {labelled.map((i) => {
        const below = i === loIdx && i !== hiIdx && i !== lastIdx && i !== 0;
        return (
          <text
            key={i}
            x={screen[i].x}
            y={screen[i].y + (below ? 18 : -12)}
            textAnchor={i === 0 ? "start" : i === lastIdx ? "end" : "middle"}
            fontSize="12"
            // Larger below sm, where the chart scales down to phone width.
            fontWeight={i === lastIdx ? 700 : 600}
            fontFamily="var(--font-mono)"
            className="tnum text-[20px] sm:text-[12px]"
            fill={i === lastIdx ? "var(--color-viz-price)" : "var(--color-body)"}
            stroke="var(--color-panel)"
            strokeWidth={4}
            paintOrder="stroke"
          >
            {pctRange(points[i].value)}
          </text>
        );
      })}

      <g
        fontSize="11"
        fontFamily="var(--font-mono)"
        fill="var(--color-viz-axis)"
        className="text-[18px] sm:text-[11px]"
      >
        <text x={x(0)} y={H - 8} textAnchor="start">
          {points[0].label}
        </text>
        {midIdx !== 0 && midIdx !== lastIdx && (
          <text x={x(midIdx)} y={H - 8} textAnchor="middle">
            {points[midIdx].label}
          </text>
        )}
        <text
          x={x(lastIdx)}
          y={H - 8}
          textAnchor="end"
          fill="var(--color-viz-price)"
          fontWeight={600}
        >
          ● now
        </text>
      </g>
    </svg>
  );
}
