"use client";

import { useMemo, useState } from "react";

import type { EarningsHistoryRow, PricePoint } from "@/lib/api";
import { formatDate, money } from "@/lib/format";
import { useIndicators } from "@/lib/useIndicators";
import { useIntradayChart } from "@/lib/useIntradayChart";

/**
 * Price chart with range tabs: 1D, 5D (intraday, via the Worker's
 * `/api/chart` proxy to Yahoo) and 1Y (the static daily series already baked
 * into the page).
 *
 * Earnings markers only make sense on the 1Y view — a single intraday bar
 * can't meaningfully carry "this is where the stock gapped," and on a day
 * that isn't an earnings day there's nothing to mark at all. 1D/5D show the
 * line alone, per Vertical's chart language.
 *
 * Hand-rolled SVG rather than a charting library: one series, one
 * interaction, and the component stays smaller than the library import.
 */

type Range = "1d" | "5d" | "1y";

const RANGES: { key: Range; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "5d", label: "5D" },
  { key: "1y", label: "1Y" },
];

// The viewBox ratio IS the rendered aspect ratio (the SVG scales to the
// panel's full width, height following automatically) — 800x240 read as a
// flat, hard-to-scan line on a wide desktop panel. 340 gives daily price
// swings enough vertical room to actually show their shape.
const H = 340;
const PAD = { top: 16, right: 14, bottom: 28, left: 56 };
const W = 800;

interface Point {
  key: string;
  label: string;
  close: number;
}

export function PriceChart({
  prices,
  events,
  ticker,
}: {
  prices: PricePoint[];
  events: EarningsHistoryRow[];
  ticker: string;
}) {
  const [range, setRange] = useState<Range>("1y");
  const [live, setLive] = useState(false);

  const intraday = useIntradayChart(ticker, range === "5d" ? "5d" : "1d", {
    live: live && range === "1d",
  });
  // Daily-only — a moving average over a few hours of 1-minute bars isn't a
  // signal anyone reads, so 1D/5D never fetch this.
  const indicators = useIndicators(ticker, range === "1y");

  const points: Point[] = useMemo(() => {
    if (range === "1y") {
      return prices.map((p) => ({ key: p.date, label: formatDate(p.date), close: p.close }));
    }
    if (!intraday.data) return [];
    return intraday.data.points.map((p) => ({
      key: p.t,
      label: new Date(p.t).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }),
      close: p.close,
    }));
  }, [range, prices, intraday.data]);

  // Only the 1Y series carries markers — see the module note above.
  const markerDates = useMemo(
    () =>
      range === "1y"
        ? new Set(
            events
              .filter((e) => e.realized_move !== null && e.realized_move !== undefined)
              .map((e) => e.report_date),
          )
        : new Set<string>(),
    [range, events],
  );

  return (
    <figure className="m-0">
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`pressable rounded-[3px] px-2.5 py-1 text-sm font-medium transition-colors ${
                range === r.key
                  ? "bg-[var(--color-brand)] text-[var(--color-on-brand)]"
                  : "text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {range === "1d" && (
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className="pressable flex items-center gap-1.5 text-sm text-[var(--color-body)]"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                live ? "live-dot bg-[var(--color-positive)]" : "bg-[var(--color-border)]"
              }`}
              aria-hidden
            />
            {live ? "Live · updates every 30s" : "Go live"}
          </button>
        )}
      </div>

      {range !== "1y" && intraday.loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">Loading…</p>
      ) : range !== "1y" && intraday.error ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">
          {intraday.error} Try the 1Y view instead.
        </p>
      ) : (
        <ChartBody
          points={points}
          markerDates={markerDates}
          intraday={range !== "1y"}
          sma20={indicators?.sma20}
          ema50={indicators?.ema50}
        />
      )}
    </figure>
  );
}

/** SVG path for an overlay series keyed by date against the main series' own
 * x/y scale — breaks into a fresh `M` after any gap (an indicator's warm-up
 * window, a date the main series doesn't have) rather than drawing a line
 * across missing data. */
function overlayPath(
  points: Point[],
  byDate: Map<string, number>,
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let d = "";
  let prevIdx: number | null = null;
  points.forEach((p, i) => {
    const v = byDate.get(p.key);
    if (v === undefined) {
      prevIdx = null;
      return;
    }
    d += `${prevIdx === i - 1 ? "L" : "M"}${x(i)} ${y(v)} `;
    prevIdx = i;
  });
  return d.trim();
}

function ChartBody({
  points,
  markerDates,
  intraday,
  sma20,
  ema50,
}: {
  points: Point[];
  markerDates: Set<string>;
  intraday: boolean;
  sma20?: { date: string; value: number }[];
  ema50?: { date: string; value: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (points.length < 2) return null;

    const closes = points.map((p) => p.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    // A flat series would divide by zero; pad so it renders as a centered
    // horizontal line rather than vanishing.
    const span = max - min || Math.max(max * 0.02, 0.01);
    const lo = min - span * 0.08;
    const hi = max + span * 0.08;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const x = (i: number) => PAD.left + (i / (points.length - 1)) * plotW;
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(p.close)}`).join(" ");

    const markers = intraday
      ? []
      : points
          .map((p, i) =>
            markerDates.has(p.key) ? { key: p.key, cx: x(i), cy: y(p.close) } : null,
          )
          .filter((m): m is { key: string; cx: number; cy: number } => m !== null);

    const smaLine =
      !intraday && sma20?.length
        ? overlayPath(points, new Map(sma20.map((p) => [p.date, p.value])), x, y)
        : "";
    const emaLine =
      !intraday && ema50?.length
        ? overlayPath(points, new Map(ema50.map((p) => [p.date, p.value])), x, y)
        : "";

    const ticks = [lo + (hi - lo) * 0.08, (lo + hi) / 2, hi - (hi - lo) * 0.08];

    return { x, y, line, markers, smaLine, emaLine, ticks, plotW, plotH, min, max };
  }, [points, markerDates, intraday, sma20, ema50]);

  if (!chart) {
    return (
      <p className="py-10 text-center text-sm text-[var(--color-muted)]">
        No price history available.
      </p>
    );
  }

  const point = hover !== null ? points[hover] : null;
  const onMarker = hover !== null && markerDates.has(points[hover].key);

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`${intraday ? "Intraday" : "Daily"} closing price. Range ${money(
            chart.min,
          )} to ${money(chart.max)}.`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const rel = ((e.clientX - rect.left) / rect.width) * W;
            const frac = (rel - PAD.left) / chart.plotW;
            const idx = Math.round(frac * (points.length - 1));
            setHover(idx >= 0 && idx < points.length ? idx : null);
          }}
        >
          {/* Hairline gridlines, one step off the surface. Recessive by
              lightness, not by dashing. */}
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
                ${t.toFixed(0)}
              </text>
            </g>
          ))}

          {/* SMA/EMA overlays render under the price line so the primary
              series stays the most prominent mark on the chart. */}
          {chart.smaLine && (
            <path
              d={chart.smaLine}
              fill="none"
              stroke="var(--color-viz-sma)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {chart.emaLine && (
            <path
              d={chart.emaLine}
              fill="none"
              stroke="var(--color-viz-ema)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* No area fill — Vertical draws the line alone. */}
          <path
            d={chart.line}
            fill="none"
            stroke="var(--color-viz-price)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Earnings markers, 1Y view only. The 2px surface ring keeps them
              legible where they sit on the line. */}
          {chart.markers.map((m) => (
            <circle
              key={m.key}
              cx={m.cx}
              cy={m.cy}
              r={4}
              fill="var(--color-viz-realized)"
              stroke="var(--color-panel)"
              strokeWidth={2}
            />
          ))}

          {hover !== null && (
            <line
              x1={chart.x(hover)}
              x2={chart.x(hover)}
              y1={PAD.top}
              y2={PAD.top + chart.plotH}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
          )}
        </svg>

        {point && (
          <div
            className="pointer-events-none absolute top-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-xs"
            style={{ left: `${(chart.x(hover!) / W) * 100}%`, transform: "translateX(-50%)" }}
          >
            <div className="tnum font-semibold text-[var(--color-heading)]">
              {money(point.close)}
            </div>
            <div className="text-[var(--color-muted)]">{point.label}</div>
            {onMarker && (
              <div className="mt-0.5 font-mono tracking-[0.06em] text-[var(--color-viz-realized)] text-[var(--text-2xs)] uppercase">
                Earnings
              </div>
            )}
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex items-center gap-4 text-sm text-[var(--color-muted)]">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-0.5 w-4"
            style={{ background: "var(--color-viz-price)" }}
          />
          {intraday ? "Price" : "Daily close"}
        </span>
        {chart.smaLine && (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-4"
              style={{ background: "var(--color-viz-sma)" }}
            />
            SMA 20
          </span>
        )}
        {chart.emaLine && (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-4"
              style={{ background: "var(--color-viz-ema)" }}
            />
            EMA 50
          </span>
        )}
        {!intraday && chart.markers.length > 0 && (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--color-viz-realized)" }}
            />
            Earnings date
          </span>
        )}
      </figcaption>
    </div>
  );
}
