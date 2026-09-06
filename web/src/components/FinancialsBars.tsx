"use client";

import { type FinancialsQuarter, periodLabel } from "@/lib/useFinancials";

/**
 * Three single-series bar charts — GAAP EPS, Sales, Shares outstanding — the
 * "at a glance, is this business growing, and is it diluting?" view a paired
 * revenue/net-income chart doesn't give. Deliberately label-on-bar and
 * hover-free (unlike FinancialsChart): each value is printed on its bar, so
 * the three read as a scannable row rather than three things to mouse over.
 *
 * EPS goes red below zero (a loss quarter) / blue above; Sales and Shares are
 * always-positive magnitudes in their own accent color. Colors reuse the
 * validated --color-viz-* / --color-negative tokens rather than inventing new
 * ones.
 */

// A single-series mini chart stays readable at ~1/3 panel width only with few
// bars; past this they compress under the value labels.
const MAX_BARS = 9;

interface Series {
  title: string;
  unit: string; // shown under the title, e.g. "$bln", "mln"
  color: string; // CSS var for positive bars
  negColor?: string; // CSS var for bars below zero (EPS only)
  /** raw field -> chart value in the unit's scale (e.g. revenue / 1e9). */
  value: (q: FinancialsQuarter) => number | null;
  /** how the on-bar label renders that scaled value. */
  format: (v: number) => string;
}

const SERIES: Series[] = [
  {
    title: "GAAP EPS",
    unit: "$/share",
    color: "var(--color-viz-sma)",
    negColor: "var(--color-negative)",
    value: (q) => q.diluted_eps,
    format: (v) => v.toFixed(2),
  },
  {
    title: "Sales",
    unit: "$bln",
    color: "var(--color-viz-ema)",
    value: (q) => (typeof q.revenue === "number" ? q.revenue / 1e9 : null),
    format: (v) => v.toFixed(2),
  },
  {
    title: "Shares outstanding",
    unit: "mln",
    color: "var(--color-viz-realized)",
    // typeof, not `=== null`: a payload cached before `shares` existed omits
    // the field entirely (undefined), which `/ 1e6` would turn into NaN.
    value: (q) => (typeof q.shares === "number" ? q.shares / 1e6 : null),
    format: (v) => v.toFixed(0),
  },
];

export function FinancialsBars({ quarters }: { quarters: FinancialsQuarter[] }) {
  // Newest-first in; take the most recent slice, then oldest->newest so time
  // reads left to right.
  const periods = quarters.slice(0, MAX_BARS).reverse();

  const charts = SERIES.map((s) => ({
    series: s,
    points: periods.map((q) => ({ label: periodLabel(q), value: s.value(q) })),
  })).filter((c) => c.points.some((p) => p.value !== null));

  if (charts.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        No per-share, sales, or share-count history to chart yet.
      </p>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {charts.map((c) => (
        <MiniBars key={c.series.title} series={c.series} points={c.points} />
      ))}
    </div>
  );
}

const W = 300;
const H = 170;
const PAD = { top: 18, right: 6, bottom: 22, left: 6 };

function MiniBars({
  series,
  points,
}: {
  series: Series;
  points: { label: string; value: number | null }[];
}) {
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  const rawMax = Math.max(...vals, 0);
  const rawMin = Math.min(...vals, 0);
  const max = rawMax * 1.18 || 1;
  const min = rawMin < 0 ? rawMin * 1.18 : 0;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / points.length;
  const barW = Math.min(30, band * 0.62);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH;
  const zeroY = y(0);

  return (
    <figure className="m-0">
      <figcaption className="mb-1">
        <span className="text-sm font-semibold text-[var(--color-heading)]">
          {series.title}
        </span>{" "}
        <span className="text-2xs text-[var(--color-muted)]">({series.unit})</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${series.title} over the last ${points.length} periods.`}
      >
        {/* zero baseline (only visible when the series dips below zero) */}
        {min < 0 && (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={zeroY}
            y2={zeroY}
            stroke="var(--color-viz-grid)"
            strokeWidth={1}
          />
        )}

        {points.map((p, i) => {
          const cx = PAD.left + band * i + band / 2;
          if (p.value === null) {
            return (
              <text
                key={i}
                x={cx}
                y={H - 8}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-viz-axis)"
              >
                {p.label}
              </text>
            );
          }
          const barTop = Math.min(y(p.value), zeroY);
          const barH = Math.abs(zeroY - y(p.value)) || 1;
          const negative = p.value < 0;
          const fill = negative && series.negColor ? series.negColor : series.color;
          const labelY = negative ? barTop + barH + 10 : barTop - 4;

          return (
            <g key={i}>
              <rect
                x={cx - barW / 2}
                y={barTop}
                width={barW}
                height={barH}
                rx={2}
                fill={fill}
              />
              <text
                x={cx}
                y={labelY}
                textAnchor="middle"
                className="tnum"
                fontSize={9}
                fontWeight={600}
                fill="var(--color-heading)"
              >
                {series.format(p.value)}
              </text>
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-viz-axis)"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
