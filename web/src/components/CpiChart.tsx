"use client";

import { useMemo, useState } from "react";

import { EMPTY } from "@/lib/format";
import type { CpiMonth } from "@/lib/useCpiHistory";

/**
 * CPI as a line, not just the table underneath it — inflation is a trend
 * question ("is this rolling over?") and a column of numbers is the one
 * shape that can't answer it at a glance.
 *
 * Headline vs core on the same axis, since the gap between them IS the
 * read: headline moving while core holds is energy/food noise, both
 * moving together is broad. Year-over-year by default (how the print is
 * quoted and how the Fed talks about it); month-over-month is a toggle
 * for the recent-momentum view.
 *
 * No good/bad coloring — same rule CpiHistoryTable already follows. An
 * inflation print isn't a verdict this app takes a stance on. The two
 * series are told apart by the same SMA/EMA hue pair the price chart
 * uses, which was already validated for both themes.
 */

const W = 800;
const H = 260;
const PAD = { top: 16, right: 14, bottom: 30, left: 46 };
const X_TICKS = 6;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

type Basis = "yoy" | "mom";

const BASIS_LABEL: Record<Basis, string> = {
  yoy: "Year over year",
  mom: "Month over month",
};

export function CpiChart({ months }: { months: CpiMonth[] }) {
  const [basis, setBasis] = useState<Basis>("yoy");
  const [hover, setHover] = useState<number | null>(null);

  const chart = useMemo(() => {
    // The table renders newest-first; a chart has to run forward in time.
    const ordered = [...months].sort((a, b) => a.month.localeCompare(b.month));

    const pick = (m: CpiMonth) =>
      basis === "yoy"
        ? { headline: m.yoy_pct, core: m.core_yoy_pct }
        : { headline: m.mom_pct, core: m.core_mom_pct };

    // A month with no headline value for this basis can't be plotted —
    // the first 12 months of any series have no YoY by definition.
    const points = ordered
      .map((m) => ({ month: m.month, ...pick(m) }))
      .filter((p) => p.headline !== null);

    if (points.length < 2) return null;

    const values = points
      .flatMap((p) => [p.headline, p.core])
      .filter((v): v is number => v !== null);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const span = max - min || 1;
    const lo = min - span * 0.1;
    const hi = max + span * 0.1;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW;
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

    /** Breaks into a fresh `M` across a gap rather than drawing a straight
     * line over months the series doesn't cover — same rule the price
     * chart's indicator overlays follow. */
    const path = (key: "headline" | "core") => {
      let d = "";
      let prev = false;
      points.forEach((p, i) => {
        const v = p[key];
        if (v === null) {
          prev = false;
          return;
        }
        d += `${prev ? "L" : "M"}${x(i)} ${y(v)} `;
        prev = true;
      });
      return d.trim();
    };

    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) ticks.push(lo + ((hi - lo) / 4) * i);

    const tickCount = Math.min(X_TICKS, points.length);
    const seen = new Set<number>();
    const monthTicks = Array.from({ length: tickCount }, (_, i) =>
      Math.round((i / Math.max(1, tickCount - 1)) * (points.length - 1)),
    )
      .filter((idx) => (seen.has(idx) ? false : (seen.add(idx), true)))
      .map((idx) => ({ x: x(idx), label: monthLabel(points[idx].month) }));

    return {
      points,
      x,
      y,
      headline: path("headline"),
      core: path("core"),
      ticks,
      monthTicks,
      zeroY: y(0),
      showZero: lo < 0,
    };
  }, [months, basis]);

  if (!chart) {
    return (
      <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
        Not enough released months to chart yet.
      </p>
    );
  }

  const active = hover !== null ? chart.points[hover] : null;

  function hoverFromClientX(clientX: number, rect: DOMRect) {
    const localX = ((clientX - rect.left) / rect.width) * W;
    const frac = (localX - PAD.left) / (W - PAD.left - PAD.right);
    const idx = Math.round(frac * (chart!.points.length - 1));
    setHover(Math.max(0, Math.min(chart!.points.length - 1, idx)));
  }

  return (
    <figure className="m-0 px-5 py-4">
      <div className="mb-3 inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
        {(["yoy", "mom"] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBasis(b)}
            aria-pressed={basis === b}
            className={`pressable rounded-[3px] px-2.5 py-1 text-sm font-medium transition-colors ${
              basis === b
                ? "bg-[var(--color-panel-soft)] text-[var(--color-heading)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)]"
            }`}
          >
            {BASIS_LABEL[b]}
          </button>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`CPI ${BASIS_LABEL[basis].toLowerCase()}, headline and core.`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) =>
            hoverFromClientX(e.clientX, e.currentTarget.getBoundingClientRect())
          }
        >
          {chart.ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={chart.y(t)}
                y2={chart.y(t)}
                stroke="var(--color-viz-grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={chart.y(t) + 3}
                textAnchor="end"
                className="tnum"
                fontSize={10}
                fill="var(--color-viz-axis)"
              >
                {t.toFixed(1)}%
              </text>
            </g>
          ))}

          {/* Zero only matters when the series actually crosses it —
              deflation is rare, and an always-drawn zero line sitting off
              the bottom edge is just noise. */}
          {chart.showZero && (
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={chart.zeroY}
              y2={chart.zeroY}
              stroke="var(--color-border)"
              strokeWidth={1.5}
            />
          )}

          {chart.monthTicks.map((t, i) => (
            <text
              key={i}
              x={t.x}
              y={H - PAD.bottom + 16}
              textAnchor={
                i === 0 ? "start" : i === chart.monthTicks.length - 1 ? "end" : "middle"
              }
              fontSize={10}
              fill="var(--color-viz-axis)"
            >
              {t.label}
            </text>
          ))}

          <path
            d={chart.core}
            fill="none"
            stroke="var(--color-viz-ema)"
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={chart.headline}
            fill="none"
            stroke="var(--color-viz-sma)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {hover !== null && (
            <line
              x1={chart.x(hover)}
              x2={chart.x(hover)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-0 w-max rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-2 text-xs"
            style={{
              left: `${Math.min(90, Math.max(10, (chart.x(hover!) / W) * 100))}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="mb-1 border-b border-[var(--color-border-subtle)] pb-1 text-[var(--color-muted)]">
              {monthLabel(active.month)}
            </div>
            <div className="tnum flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-3"
                style={{ background: "var(--color-viz-sma)" }}
              />
              <span className="text-[var(--color-muted)]">Headline</span>
              <span className="ml-auto font-medium text-[var(--color-heading)]">
                {active.headline !== null ? `${active.headline.toFixed(2)}%` : EMPTY}
              </span>
            </div>
            <div className="tnum mt-0.5 flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-3"
                style={{ background: "var(--color-viz-ema)" }}
              />
              <span className="text-[var(--color-muted)]">Core</span>
              <span className="ml-auto font-medium text-[var(--color-heading)]">
                {active.core !== null ? `${active.core.toFixed(2)}%` : EMPTY}
              </span>
            </div>
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[var(--color-body)]">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-0.5 w-4"
            style={{ background: "var(--color-viz-sma)" }}
          />
          Headline CPI
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-0.5 w-4"
            style={{ background: "var(--color-viz-ema)" }}
          />
          Core CPI
        </span>
        <span className="text-[var(--color-muted)]">Core excludes food and energy</span>
      </figcaption>
    </figure>
  );
}
