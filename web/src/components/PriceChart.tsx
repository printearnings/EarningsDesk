"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";

import type { EarningsHistoryRow, PricePoint } from "@/lib/api";
import { compact, formatDate, formatDateShort, money } from "@/lib/format";
import type { MACDPoint } from "@/lib/useIndicators";
import { useIndicators } from "@/lib/useIndicators";
import { useIntradayChart } from "@/lib/useIntradayChart";

/**
 * Price chart with range tabs: 1D, 5D (intraday, via the Worker's
 * `/api/chart` proxy to Massive) and 1Y (the static daily series already
 * baked into the page). A Line/Candle toggle switches the mark, and an SMA
 * 20 / EMA 50 overlay is available on every range — both modes and every
 * range share the same x/y scale, hover crosshair, and zoom.
 *
 * Zoom is scroll-wheel (in/out, centered on the cursor), and once zoomed,
 * click-drag pans the visible window left/right — the standard trading-chart
 * combo. Scrolling over the chart claims the wheel event entirely rather
 * than falling back to the page scroll; that's a deliberate trade so the
 * chart is zoomable without a modifier key. Double-click, or the
 * "Reset zoom" control that appears once zoomed, zooms back out.
 *
 * Earnings markers render on every range, including 1D/5D — on those, the
 * marker lands on the first intraday bar of the report's calendar date
 * (matched in market time, not the reader's own timezone) rather than on
 * a specific minute, since the point is "a print happened this day," not
 * pinpointing BMO/AMC to the minute.
 *
 * Hand-rolled SVG rather than a charting library: one series, a handful of
 * interactions, and the component stays smaller than the library import.
 */

type Range = "1d" | "5d" | "1y";
type ChartType = "line" | "candle";
type IndicatorKey = "sma20" | "ema50" | "rsi14" | "macd" | "volume";

const RANGES: { key: Range; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "5d", label: "5D" },
  { key: "1y", label: "1Y" },
];

const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: "line", label: "Line" },
  { key: "candle", label: "Candles" },
];

// Off by default — a fresh chart is a price and nothing else; these are
// each a deliberate opt-in via the settings menu, not a default cost every
// reader pays whether they read technicals or not.
const INDICATOR_OPTIONS: { key: IndicatorKey; label: string }[] = [
  { key: "sma20", label: "SMA 20" },
  { key: "ema50", label: "EMA 50" },
  { key: "rsi14", label: "RSI 14" },
  { key: "macd", label: "MACD (12, 26, 9)" },
  { key: "volume", label: "Volume" },
];

// The viewBox ratio IS the rendered aspect ratio (the SVG scales to the
// panel's full width, height following automatically) — 800x240 read as a
// flat, hard-to-scan line on a wide desktop panel. 340 gives daily price
// swings enough vertical room to actually show their shape.
const H = 340;
const PAD = { top: 16, right: 14, bottom: 34, left: 56 };
const W = 800;

// Sub-panels (volume/RSI/MACD) share the main chart's left/right padding —
// same x-scale, so their bars and lines land exactly under the candle above
// them — but are their own short SVGs with their own top/bottom padding and
// y-scale, since none of the three share the price axis.
const VOLUME_H = 110;
const RSI_H = 84;
const MACD_H = 96;
const SUB_PAD = { top: 10, bottom: 18 };

// Below this many visible points, a zoom stops being useful — the chart
// would be reading individual bars as a jagged wall rather than a shape.
const MIN_ZOOM_POINTS = 10;

/** An intraday point's ISO timestamp -> its "YYYY-MM-DD" calendar date in
 * the exchange's own timezone — matches an earnings event's report_date
 * (a market-calendar date) regardless of the reader's own timezone. */
function etDateString(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// How many x-axis ticks to draw. Independent of point density — the same
// count reads fine whether there are 30 daily bars or 390 one-minute ones,
// since ticks are picked by evenly spacing *indices*, not raw point count.
const X_TICK_COUNT = 6;

/** Short axis-tick text for a point's key — deliberately terser than the
 * hover tooltip's label (no timezone suffix, no year): 1D gets a bare
 * time-of-day, 5D/1Y get a date, since a reader scanning six ticks along
 * the bottom needs a shape, not the full precision the tooltip already
 * gives on demand. */
function axisLabel(range: Range, key: string): string {
  if (range === "1d") {
    return new Date(key).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (range === "5d") {
    return new Date(key).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  const [y, m, d] = key.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Point {
  key: string;
  label: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
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
  const [range, setRange] = useState<Range>("1d");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [live, setLive] = useState(false);
  const [enabledIndicators, setEnabledIndicators] = useState<Set<IndicatorKey>>(
    () => new Set(),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggleIndicator(key: IndicatorKey) {
    setEnabledIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const intraday = useIntradayChart(ticker, range === "5d" ? "5d" : "1d", {
    live: live && range === "1d",
  });
  const indicators = useIndicators(ticker, range);

  const points: Point[] = useMemo(() => {
    if (range === "1y") {
      return prices.map((p) => ({
        key: p.date,
        label: formatDate(p.date),
        close: p.close,
        open: p.open ?? undefined,
        high: p.high ?? undefined,
        low: p.low ?? undefined,
        volume: p.volume ?? undefined,
      }));
    }
    if (!intraday.data) return [];
    return intraday.data.points.map((p) => ({
      key: p.t,
      // Month/day up front, not just the time — 5D spans multiple sessions,
      // and even on 1D a bare time-of-day is ambiguous once it's converted
      // out of market time into whatever zone `undefined` locale/timezone
      // resolves to in the reader's own browser (labeled via
      // `timeZoneName: "short"` — PDT, EDT, etc — so it's at least never
      // mistaken for market time).
      label: new Date(p.t).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }),
      close: p.close,
      open: p.open,
      high: p.high,
      low: p.low,
      volume: p.volume,
    }));
  }, [range, prices, intraday.data]);

  // A regular NYSE session is 6.5h of 1m bars (390). Early in the trading
  // day the 1D series only has however many of those have actually printed
  // — stretching that partial count across the chart's full width would
  // draw the *shape* of a finished trading day out of a morning's worth of
  // bars, implying the rest of the day already happened when it hasn't.
  // `null` (no fraction applied) once the session's worth of bars is in, or
  // for any range other than 1D, where this scaling doesn't apply.
  const FULL_SESSION_BARS = 390;
  const partialSessionFraction =
    range === "1d" && points.length > 0 && points.length < FULL_SESSION_BARS
      ? points.length / FULL_SESSION_BARS
      : null;

  // 1D's lookback buffer reaches back past a closed market to the last real
  // session (see RANGE_LOOKBACK_DAYS in the Worker), so outside market hours
  // this is showing where that session ended, not a live-updating today.
  // "Go live" only makes sense once the newest bar actually IS today's.
  const isCurrentSession =
    range !== "1d" ||
    points.length === 0 ||
    new Date(points[points.length - 1].key).toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    }) === new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  // Every range carries markers — see the module note above. Gated on the
  // report date being in the past, not on `realized_move` being populated:
  // those are two different facts. A print that happened yesterday but
  // hasn't been through the scoring pipeline yet still happened — it should
  // still get marked. Using realized_move here (the original 1Y-only
  // implementation's signal) meant most historical prints for most tickers
  // silently had no marker at all, since scoring runs on its own cadence
  // and lags well behind "did this report occur."
  const marketToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const markerDates = useMemo(
    () => new Set(events.filter((e) => e.report_date <= marketToday).map((e) => e.report_date)),
    [events, marketToday],
  );

  return (
    <figure className="m-0">
      {/* flex-wrap: the right-hand group (live indicator, line/candle toggle,
          settings) doesn't fit next to the range toggle below ~400px wide —
          without wrap it doesn't shrink to fit, it overflows the card. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-y-2">
        <div className="inline-flex shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
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

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {range === "1d" && points.length > 0 && (
            // Digit-roll animation only matters when the value can actually
            // change on its own — a live 30s poll, not a static daily close
            // the reader loaded once and will never see move.
            <span className="tnum shrink-0 text-sm font-medium text-[var(--color-heading)]">
              <NumberFlow
                value={points[points.length - 1].close}
                format={{ style: "currency", currency: "USD" }}
              />
            </span>
          )}

          {range === "1d" && points.length > 0 && !isCurrentSession && (
            <span className="text-sm whitespace-nowrap text-[var(--color-muted)]">
              Last session:{" "}
              {formatDateShort(
                new Date(points[points.length - 1].key).toLocaleDateString("en-CA", {
                  timeZone: "America/New_York",
                }),
              )}
            </span>
          )}

          {range === "1d" && isCurrentSession && (
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              className="pressable flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap text-[var(--color-body)]"
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

          <div className="inline-flex shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
            {CHART_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setChartType(t.key)}
                aria-pressed={chartType === t.key}
                aria-label={t.label}
                title={t.label}
                className={`pressable flex h-[30px] w-[30px] items-center justify-center rounded-[3px] transition-colors ${
                  chartType === t.key
                    ? "bg-[var(--color-panel-soft)] text-[var(--color-heading)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)]"
                }`}
              >
                {t.key === "line" ? <LineTypeIcon /> : <CandleTypeIcon />}
              </button>
            ))}
          </div>

          <div ref={settingsRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label="Chart indicators"
              aria-expanded={settingsOpen}
              aria-haspopup="true"
              className={`pressable flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-sm)] border transition-colors ${
                enabledIndicators.size > 0
                  ? "border-[var(--color-heading)]/20 bg-[var(--color-panel-soft)] text-[var(--color-heading)]"
                  : "border-[var(--color-border)] text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]"
              }`}
            >
              <GearIcon />
            </button>

            {settingsOpen && (
              // Same drop-in-from-trigger scale/opacity treatment as
              // TickerSearch's popover — nothing in the app appears from
              // nowhere.
              <div className="absolute top-full right-0 z-20 mt-1 w-52 origin-top-right overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] opacity-100 shadow-none transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] starting:scale-95 starting:opacity-0">
                <div className="eyebrow border-b border-[var(--color-border-subtle)] px-3 py-2 text-[var(--color-muted)]">
                  Indicators
                </div>
                <ul className="py-1">
                  {INDICATOR_OPTIONS.map((opt) => (
                    <li key={opt.key}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]">
                        <input
                          type="checkbox"
                          checked={enabledIndicators.has(opt.key)}
                          onChange={() => toggleIndicator(opt.key)}
                          className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                        />
                        {opt.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {range !== "1y" && intraday.loading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">Loading…</p>
      ) : range !== "1y" && intraday.error ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">
          {intraday.error} Try the 1Y view instead.
        </p>
      ) : range !== "1y" && points.length === 0 ? (
        // Distinct from `intraday.error`: the fetch succeeded, there is just
        // nothing to plot yet — the normal state for 1D outside market hours,
        // not a broken chart. Same fallback pointer as the error case above.
        <p className="py-10 text-center text-sm text-[var(--color-muted)]">
          No trading data yet for this window. Markets may be closed. Try 5D or 1Y.
        </p>
      ) : (
        <ChartBody
          points={points}
          markerDates={markerDates}
          intraday={range !== "1y"}
          range={range}
          chartType={chartType}
          zoomResetKey={range}
          enabledIndicators={enabledIndicators}
          sma20={indicators?.sma20}
          ema50={indicators?.ema50}
          rsi14={indicators?.rsi14}
          macd={indicators?.macd}
          partialSessionFraction={partialSessionFraction}
        />
      )}
    </figure>
  );
}

function LineTypeIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 11.5 6 7l2.5 2.5L14 4"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CandleTypeIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden>
      <line x1="4.5" y1="1.5" x2="4.5" y2="14.5" stroke="currentColor" strokeWidth={1.3} />
      <rect x="2.8" y="5" width="3.4" height="5" rx="0.5" fill="currentColor" />
      <line x1="11.5" y1="1.5" x2="11.5" y2="14.5" stroke="currentColor" strokeWidth={1.3} />
      <rect x="9.8" y="7.5" width="3.4" height="4" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 10.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z"
        stroke="currentColor"
        strokeWidth={1.3}
      />
      <path
        d="M8 1.5v1.4M8 13.1v1.4M14.5 8h-1.4M2.9 8H1.5M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Euclidean distance between two touch points, in the same client-pixel
 * space `getBoundingClientRect` uses — the raw input a pinch gesture's zoom
 * factor is derived from. */
function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
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

interface Candle {
  key: string;
  cx: number;
  bodyTop: number;
  bodyBottom: number;
  wickTop: number;
  wickBottom: number;
  up: boolean;
  width: number;
}

/** [start, end] indices into the full `points` array, inclusive. `null` means
 * "not zoomed — show everything." */
type ZoomDomain = [number, number] | null;

function ChartBody({
  points,
  markerDates,
  intraday,
  range,
  chartType,
  zoomResetKey,
  enabledIndicators,
  sma20,
  ema50,
  rsi14,
  macd,
  partialSessionFraction,
}: {
  points: Point[];
  markerDates: Set<string>;
  intraday: boolean;
  range: Range;
  chartType: ChartType;
  zoomResetKey: string;
  enabledIndicators: Set<IndicatorKey>;
  sma20?: { date: string; value: number }[];
  ema50?: { date: string; value: number }[];
  rsi14?: { date: string; value: number }[];
  macd?: MACDPoint[];
  /** Fraction (0,1) of the chart's width the *actual* bars should occupy
   * when the trading day isn't over yet — the rest stays blank rather than
   * stretching a partial session to fill the full chart. `null` to use the
   * full width, same as before this existed. */
  partialSessionFraction?: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // An earnings badge the reader clicked, by its point key. Separate from
  // `hover` on purpose: hover is transient (cleared on the next mousemove
  // or mouseleave), and a click that vanished the instant the cursor moved
  // off the badge would be useless for actually reading the value.
  const [pinnedMarker, setPinnedMarker] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomDomain>(null);
  // Anchors a pan gesture: the local index under the cursor and the global
  // offset at mousedown, so every mousemove during the drag can compute "how
  // many indices has the cursor moved" and shift the window by exactly that.
  const [pan, setPan] = useState<{ anchorLocal: number; anchorOffset: number } | null>(null);
  // Anchors a two-finger pinch: the previous frame's finger separation, so
  // each touchmove can compute an incremental zoom factor the same way one
  // wheel tick does — never a single cumulative jump from the gesture's start,
  // which would fight `zoomBy`'s own "keep this point under the cursor" math.
  // A ref, not state: purely gesture bookkeeping between touch events, never
  // read during render, so it shouldn't trigger one on every pinch tick.
  const pinchRef = useRef<{ distance: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // A pan that ends with the mouse released outside the SVG (dragged past
  // its edge, or off the browser window entirely) never fires the SVG's own
  // onMouseUp — the drag would stay "stuck" active until the next stray
  // mousemove over the chart. A window-level listener, live only while a
  // pan is actually in progress, guarantees it always clears.
  useEffect(() => {
    if (!pan) return;
    const onUp = () => setPan(null);
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [pan]);

  // Reset zoom/hover whenever the range switches to a different series —
  // done during render (React's documented pattern for "reset state when a
  // prop changes"), the same idiom this file's hooks already use for
  // ticker/range keys, rather than a setState-in-effect.
  const [prevResetKey, setPrevResetKey] = useState(zoomResetKey);
  if (prevResetKey !== zoomResetKey) {
    setPrevResetKey(zoomResetKey);
    setZoom(null);
    setPan(null);
    setHover(null);
    // The pinned badge belongs to the range that was on screen when it was
    // clicked — switching ranges rebuilds the whole series, so a key from
    // the old one would either miss or land on an unrelated bar.
    setPinnedMarker(null);
  }

  const visible = useMemo(
    () => (zoom ? points.slice(zoom[0], zoom[1] + 1) : points),
    [points, zoom],
  );

  const chart = useMemo(() => {
    if (visible.length < 2) return null;

    // Scale off high/low (falling back to close) rather than close alone, so
    // switching to candles never clips a wick and the axis doesn't jump when
    // toggling chart type.
    const highs = visible.map((p) => p.high ?? p.close);
    const lows = visible.map((p) => p.low ?? p.close);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    // A flat series would divide by zero; pad so it renders as a centered
    // horizontal line rather than vanishing.
    const span = max - min || Math.max(max * 0.02, 0.01);
    const lo = min - span * 0.08;
    const hi = max + span * 0.08;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    // Only the un-zoomed full series honors the session fraction — once
    // someone's explicitly zoomed into a window, that window is real data
    // they asked to see filled, not a partial day to leave room for.
    const effectivePlotW =
      !zoom && partialSessionFraction ? plotW * partialSessionFraction : plotW;

    const x = (i: number) => PAD.left + (i / (visible.length - 1)) * effectivePlotW;
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * plotH;

    const line = visible.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(p.close)}`).join(" ");

    // Body/wick width shrinks with density; clamped so a 1Y chart (~252
    // candles) still reads and a 1D chart (~390 1m bars) doesn't overlap.
    const candleW = Math.min(8, Math.max(1, (effectivePlotW / visible.length) * 0.6));
    const candles: Candle[] = visible
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.open !== undefined && p.high !== undefined && p.low !== undefined)
      .map(({ p, i }) => {
        const open = p.open!;
        const high = p.high!;
        const low = p.low!;
        const up = p.close >= open;
        return {
          key: p.key,
          cx: x(i),
          bodyTop: y(Math.max(open, p.close)),
          bodyBottom: y(Math.min(open, p.close)),
          wickTop: y(high),
          wickBottom: y(low),
          up,
          width: candleW,
        };
      });

    // Daily (1Y) points are already keyed by bare date, one point per day —
    // a straight Set lookup finds the match. Intraday points are keyed by
    // full timestamp with many bars per day, so matching needs the bar's ET
    // calendar date instead, and a per-date guard so a report day's ~390
    // one-minute bars don't each draw their own marker — only the first.
    const seenMarkerDates = new Set<string>();
    const markers = visible
      .map((p, i) => {
        const d = intraday ? etDateString(p.key) : p.key;
        if (!markerDates.has(d) || seenMarkerDates.has(d)) return null;
        seenMarkerDates.add(d);
        // Carries the bar's own label/close so clicking the badge can show
        // that day's price without re-deriving it from the index later.
        return { key: p.key, cx: x(i), cy: y(p.close), label: p.label, close: p.close };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    const smaLine =
      enabledIndicators.has("sma20") && sma20?.length
        ? overlayPath(visible, new Map(sma20.map((p) => [p.date, p.value])), x, y)
        : "";
    const emaLine =
      enabledIndicators.has("ema50") && ema50?.length
        ? overlayPath(visible, new Map(ema50.map((p) => [p.date, p.value])), x, y)
        : "";

    const ticks = [lo + (hi - lo) * 0.08, (lo + hi) / 2, hi - (hi - lo) * 0.08];

    // Evenly spaced by index, not by pixel — so on a partial 1D session
    // (effectivePlotW < plotW) the ticks land only across the real bars,
    // never out in the blank "future" region. Deduped by index so a short
    // series (fewer points than X_TICK_COUNT) doesn't repeat a label.
    const tickCount = Math.min(X_TICK_COUNT, visible.length);
    const seenTickIdx = new Set<number>();
    const xTicks = Array.from({ length: tickCount }, (_, i) =>
      Math.round((i / Math.max(1, tickCount - 1)) * (visible.length - 1)),
    )
      .filter((idx) => (seenTickIdx.has(idx) ? false : (seenTickIdx.add(idx), true)))
      .map((idx) => ({ x: x(idx), label: axisLabel(range, visible[idx].key) }));

    return {
      x,
      y,
      line,
      candles,
      markers,
      smaLine,
      emaLine,
      ticks,
      xTicks,
      plotW,
      effectivePlotW,
      plotH,
      min,
      max,
    };
  }, [
    visible,
    markerDates,
    intraday,
    range,
    sma20,
    ema50,
    enabledIndicators,
    zoom,
    partialSessionFraction,
  ]);

  // Volume/RSI/MACD sub-panels — each its own tiny chart, sharing `chart.x`
  // (and so the same horizontal alignment) with the candles above them.
  // Computed unconditionally (React's hooks can't be called conditionally)
  // but return null immediately when their indicator isn't toggled on, so
  // toggling one off is free and doesn't touch the others' memo.
  const volumePanel = useMemo(() => {
    if (!chart || !enabledIndicators.has("volume")) return null;
    const vols = visible.map((p) => p.volume ?? 0);
    if (!vols.some((v) => v > 0)) return null;
    const max = Math.max(...vols, 1);
    const plotH = VOLUME_H - SUB_PAD.top - SUB_PAD.bottom;
    const baseline = SUB_PAD.top + plotH;
    // Bars grow up from the baseline (0), unlike every other panel's y() —
    // keep the same "value -> pixel" shape anyway so the axis-label loop
    // below can treat it like the others.
    const y = (v: number) => baseline - (v / max) * plotH;
    const barW = Math.min(8, Math.max(1, (chart.effectivePlotW / visible.length) * 0.6));
    const bars = visible.map((p, i) => {
      const v = p.volume ?? 0;
      const up = p.open === undefined || p.close >= p.open;
      return {
        key: p.key,
        x: chart.x(i) - barW / 2,
        y: y(v),
        width: barW,
        height: baseline - y(v),
        up,
      };
    });
    return { bars, baseline, max, y };
  }, [chart, visible, enabledIndicators]);

  const rsiPanel = useMemo(() => {
    if (!chart || !enabledIndicators.has("rsi14") || !rsi14?.length) return null;
    const plotH = RSI_H - SUB_PAD.top - SUB_PAD.bottom;
    const y = (v: number) => SUB_PAD.top + (1 - v / 100) * plotH;
    const line = overlayPath(visible, new Map(rsi14.map((p) => [p.date, p.value])), chart.x, y);
    if (!line) return null;
    return { line, y };
  }, [chart, visible, enabledIndicators, rsi14]);

  const macdPanel = useMemo(() => {
    if (!chart || !enabledIndicators.has("macd") || !macd?.length) return null;
    const byKey = new Map(macd.map((p) => [p.date, p]));
    const inView = visible
      .map((p, i) => ({ p, i, m: byKey.get(p.key) }))
      .filter((row): row is { p: Point; i: number; m: MACDPoint } => row.m !== undefined);
    if (inView.length === 0) return null;

    const values = inView.flatMap(({ m }) => [m.macd, m.signal]);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const span = max - min || 1;
    const plotH = MACD_H - SUB_PAD.top - SUB_PAD.bottom;
    const y = (v: number) => SUB_PAD.top + (1 - (v - min) / span) * plotH;

    const macdLine = overlayPath(
      visible,
      new Map(macd.map((p) => [p.date, p.macd])),
      chart.x,
      y,
    );
    const signalLine = overlayPath(
      visible,
      new Map(macd.map((p) => [p.date, p.signal])),
      chart.x,
      y,
    );
    const barW = Math.min(8, Math.max(1, (chart.effectivePlotW / visible.length) * 0.6));
    const zeroY = y(0);
    const bars = inView.map(({ p, i, m }) => {
      const barY = y(m.histogram);
      return {
        key: p.key,
        x: chart.x(i) - barW / 2,
        y: Math.min(zeroY, barY),
        width: barW,
        height: Math.max(1, Math.abs(barY - zeroY)),
        up: m.histogram >= 0,
      };
    });
    return { macdLine, signalLine, bars, zeroY };
  }, [chart, visible, enabledIndicators, macd]);

  const offset = zoom ? zoom[0] : 0;

  /** Pixel x -> nearest local index into `visible`, clamped to range. Called
   * only once `chart` is confirmed non-null in the rendered JSX below, but
   * defined here (hoisted, like `panTo`/`zoomBy`) so the wheel-listener
   * effect right after it can stay above the early return — hooks can't be
   * called conditionally. */
  function localIndexAt(clientX: number, rect: DOMRect): number {
    const rel = ((clientX - rect.left) / rect.width) * W;
    const frac = (rel - PAD.left) / chart!.effectivePlotW;
    const idx = Math.round(frac * (visible.length - 1));
    return Math.max(0, Math.min(visible.length - 1, idx));
  }

  /** Slide the visible window so the index that was under the cursor at
   * mousedown is back under the cursor now — window size never changes, so
   * `hover`/`visible.length` stay valid throughout, no reset needed. */
  function panTo(anchor: { anchorLocal: number; anchorOffset: number }, currentLocal: number) {
    const windowLen = zoom ? zoom[1] - zoom[0] + 1 : points.length;
    const deltaLocal = currentLocal - anchor.anchorLocal;
    const newOffset = Math.max(
      0,
      Math.min(points.length - windowLen, anchor.anchorOffset - deltaLocal),
    );
    setZoom(
      newOffset === 0 && windowLen === points.length
        ? null
        : [newOffset, newOffset + windowLen - 1],
    );
  }

  /** Zoom in/out around a local index, keeping that data point under the
   * cursor. `factor` < 1 zooms in, > 1 zooms out; snapping back to the full
   * series once the window would cover it all. */
  function zoomBy(factor: number, centerLocal: number) {
    const centerGlobal = offset + centerLocal;
    const currentLen = visible.length;
    const newLen = Math.round(currentLen * factor);
    setHover(null); // about to be stale against the new `visible` length either way
    if (newLen >= points.length) {
      setZoom(null);
      return;
    }
    const clampedLen = Math.max(MIN_ZOOM_POINTS, Math.min(points.length, newLen));
    const centerFrac = currentLen > 1 ? centerLocal / (currentLen - 1) : 0.5;
    let newStart = Math.round(centerGlobal - centerFrac * (clampedLen - 1));
    newStart = Math.max(0, Math.min(points.length - clampedLen, newStart));
    setZoom([newStart, newStart + clampedLen - 1]);
  }

  // A React `onWheel` prop is attached passive — `preventDefault()` inside
  // it is silently ignored, so the page would scroll AND the chart would
  // zoom at once. A native listener registered with `{ passive: false }` is
  // the only way to actually claim the gesture. Re-subscribes each render
  // (zoomBy/localIndexAt aren't memoized) — cheap, and always sees current
  // state rather than a stale closure. Placed before the `!chart` early
  // return since hooks can't be called conditionally; it safely no-ops on
  // that render anyway, since svgRef never attached to an unrendered SVG.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const idx = localIndexAt(e.clientX, el.getBoundingClientRect());
      zoomBy(e.deltaY < 0 ? 0.85 : 1 / 0.85, idx);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // Touch equivalents of the mouse gestures above — one finger mirrors
  // mousedown+drag (pan, via the same `pan` state/panTo the mouse handlers
  // below use — panning is a no-op while unzoomed, same as on desktop, so
  // this is safe to fire unconditionally), and two fingers mirror the wheel
  // (pinch to zoom, centered on the pinch midpoint). Unlike a mouse, touch has
  // no hover-without-pressing phase, so hover is kept updated through the
  // drag too — showing the value under the finger while panning, not only
  // before it starts. React attaches touch listeners passively by default,
  // same issue the wheel listener above works around, so this needs the same
  // native-listener escape hatch: without it, `preventDefault()` is silently
  // ignored and the page pinch-zooms or scrolls instead of the chart.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.touches.length === 1) {
        pinchRef.current = null;
        const idx = localIndexAt(e.touches[0].clientX, rect);
        setPan({ anchorLocal: idx, anchorOffset: offset });
        setHover(idx);
      } else if (e.touches.length === 2) {
        setPan(null);
        setHover(null);
        pinchRef.current = { distance: touchDistance(e.touches[0], e.touches[1]) };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.touches.length === 1) {
        const idx = localIndexAt(e.touches[0].clientX, rect);
        if (pan) panTo(pan, idx);
        setHover(idx);
      } else if (e.touches.length === 2) {
        const distance = touchDistance(e.touches[0], e.touches[1]);
        const midClientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerLocal = localIndexAt(midClientX, rect);
        if (pinchRef.current) zoomBy(pinchRef.current.distance / distance, centerLocal);
        pinchRef.current = { distance };
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      pinchRef.current = null;
      setPan(null);
      if (e.touches.length === 0) setHover(null);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    el.addEventListener("touchcancel", onTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  });

  if (!chart) {
    return (
      <p className="py-10 text-center text-sm text-[var(--color-muted)]">
        No price history available.
      </p>
    );
  }

  // `hover` can momentarily point past the end of `visible` the instant a
  // zoom shrinks it (it was set against the pre-zoom length, one render
  // behind) — bounds-check rather than trust it, or a drag-to-zoom that
  // lands the mouse near the old far edge throws on the very next render.
  const point = hover !== null && hover < visible.length ? visible[hover] : null;
  // Resolved from the live marker list rather than stored at click time, so
  // a pan/zoom that moves the badge moves its tooltip with it — and one
  // that scrolls the badge out of view drops the tooltip too, instead of
  // leaving it stranded over an unrelated part of the chart.
  const pinnedMarkerData = pinnedMarker
    ? (chart.markers.find((m) => m.key === pinnedMarker) ?? null)
    : null;
  const onMarker =
    point !== null && markerDates.has(intraday ? etDateString(point.key) : point.key);

  return (
    <div>
      <div className="mb-1.5 flex h-4 items-center justify-end">
        {zoom && (
          <button
            type="button"
            onClick={() => setZoom(null)}
            className="pressable text-2xs font-mono tracking-[0.06em] text-[var(--color-muted)] uppercase underline decoration-dotted underline-offset-2 hover:text-[var(--color-body)]"
          >
            Reset zoom
          </button>
        )}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className={`w-full touch-none select-none ${pan ? "cursor-grabbing" : "cursor-grab"}`}
          role="img"
          aria-label={`${intraday ? "Intraday" : "Daily"} closing price. Range ${money(
            chart.min,
          )} to ${money(chart.max)}.`}
          onMouseLeave={() => {
            setPan(null);
            setHover(null);
          }}
          onMouseDown={(e) => {
            const idx = localIndexAt(e.clientX, e.currentTarget.getBoundingClientRect());
            setPan({ anchorLocal: idx, anchorOffset: offset });
          }}
          onMouseMove={(e) => {
            const idx = localIndexAt(e.clientX, e.currentTarget.getBoundingClientRect());
            if (pan) {
              panTo(pan, idx);
            } else {
              setHover(idx);
            }
          }}
          onMouseUp={() => setPan(null)}
          onDoubleClick={() => setZoom(null)}
          ref={svgRef}
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

          {/* X-axis: time-of-day on 1D, date on 5D/1Y. Ticks are spaced by
              index into `visible`, so on a partial 1D session they land only
              across the real bars — never out in the blank "future" region
              the effectivePlotW scaling leaves empty. */}
          {chart.xTicks.map((t, i) => (
            <text
              key={i}
              x={t.x}
              y={H - PAD.bottom + 16}
              // Center-anchoring every tick, including the first/last, ran
              // the edge labels past the card boundary (the last one — e.g.
              // "Aug 18" — got clipped mid-character). Anchor those two off
              // their own edge instead, so they grow inward rather than out
              // past the plot.
              textAnchor={i === 0 ? "start" : i === chart.xTicks.length - 1 ? "end" : "middle"}
              fontSize={10}
              fill="var(--color-viz-axis)"
            >
              {t.label}
            </text>
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

          {chartType === "candle" && chart.candles.length > 0 ? (
            <g>
              {chart.candles.map((c) => (
                <g key={c.key}>
                  <line
                    x1={c.cx}
                    x2={c.cx}
                    y1={c.wickTop}
                    y2={c.wickBottom}
                    stroke={c.up ? "var(--color-positive)" : "var(--color-negative)"}
                    strokeWidth={1}
                  />
                  <rect
                    x={c.cx - c.width / 2}
                    y={c.bodyTop}
                    width={c.width}
                    // A doji (open == close) would render a 0-height rect and
                    // vanish; floor it at 1px so every bar stays visible.
                    height={Math.max(1, c.bodyBottom - c.bodyTop)}
                    fill={c.up ? "var(--color-positive)" : "var(--color-negative)"}
                  />
                </g>
              ))}
            </g>
          ) : (
            // No area fill — Vertical draws the line alone.
            <path
              d={chart.line}
              fill="none"
              stroke="var(--color-viz-price)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Earnings-date badges, every range. A plain unlabeled dot reads
              as "some kind of marker" at best — an "E" badge (Finviz's
              convention) is unmistakable at a glance, which is the whole
              point of marking the date at all. The 2px surface ring keeps
              the badge legible against the line/candles it sits on top of. */}
          {chart.markers.map((m) => (
            <g
              key={m.key}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`Earnings on ${m.label}, close ${money(m.close)}`}
              onClick={(e) => {
                // The SVG's own mousedown starts a pan gesture and its
                // mousemove drives the crosshair — neither should fire for
                // a click that's aimed at this badge.
                e.stopPropagation();
                setPinnedMarker((cur) => (cur === m.key ? null : m.key));
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPinnedMarker((cur) => (cur === m.key ? null : m.key));
                }
              }}
            >
              {/* A transparent disc wider than the visible badge — an 8px
                  target is under the ~24px minimum comfortable hit area,
                  especially on touch. */}
              <circle cx={m.cx} cy={m.cy} r={14} fill="transparent" />
              <circle
                cx={m.cx}
                cy={m.cy}
                r={8}
                fill="var(--color-viz-realized)"
                stroke="var(--color-panel)"
                strokeWidth={2}
              />
              <text
                x={m.cx}
                y={m.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
                fontWeight={700}
                fill="var(--color-on-brand)"
                className="pointer-events-none select-none"
              >
                E
              </text>
            </g>
          ))}

          {/* Not gated on `!pan` — a mouse only sets `pan` while actually
              dragging, but touch sets it on every finger-down (panning is a
              no-op unless zoomed), so gating on it hid the crosshair for
              the entire duration of any touch. `visible`/`hover` are both
              current as of this render either way, so showing it while
              panning is accurate, not stale. */}
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
            className="pointer-events-none absolute top-0 w-max max-w-40 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-2 text-xs"
            style={{
              // Clamped the same way OpenInterestChart's tooltip is — an
              // unclamped `translateX(-50%)` centered on the cursor pushes
              // half the box past the card edge near either end of the
              // series, which is what was squeezing the date onto three
              // wrapped lines in the top-right corner.
              left: `${Math.min(92, Math.max(8, (chart.x(hover!) / W) * 100))}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="mb-1 border-b border-[var(--color-border-subtle)] pb-1 text-[var(--color-muted)]">
              {point.label}
            </div>
            {/* O/H/L/C whenever the bar actually carries them, regardless of
                whether the line or candle mark is on screen — the line mode
                hides the candle bodies, not the underlying OHLC data. */}
            {point.open !== undefined ? (
              <div className="tnum grid grid-cols-2 gap-x-2 gap-y-0.5 font-semibold text-[var(--color-heading)]">
                <span className="text-[var(--color-muted)]">O</span>
                <span>{money(point.open)}</span>
                <span className="text-[var(--color-muted)]">H</span>
                <span>{money(point.high)}</span>
                <span className="text-[var(--color-muted)]">L</span>
                <span>{money(point.low)}</span>
                <span className="text-[var(--color-muted)]">C</span>
                <span>{money(point.close)}</span>
              </div>
            ) : (
              <div className="tnum font-semibold text-[var(--color-heading)]">
                {money(point.close)}
              </div>
            )}
            {onMarker && (
              <div className="mt-1 font-mono tracking-[0.06em] text-[var(--color-viz-realized)] text-[var(--text-2xs)] uppercase">
                Earnings
              </div>
            )}
          </div>
        )}

        {/* The clicked earnings badge. Rendered after (above) the hover
            tooltip so the thing the reader deliberately pinned wins the
            stacking order over the one that follows their cursor. */}
        {pinnedMarkerData && (
          <div
            className="absolute top-0 w-max max-w-48 rounded-[var(--radius-sm)] border border-[var(--color-viz-realized)]/40 bg-[var(--color-panel)] px-2.5 py-2 text-xs"
            style={{
              left: `${Math.min(92, Math.max(8, (pinnedMarkerData.cx / W) * 100))}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="mb-1 flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-1">
              <span className="font-mono tracking-[0.06em] text-[var(--color-viz-realized)] text-[var(--text-2xs)] uppercase">
                Earnings
              </span>
              <button
                type="button"
                onClick={() => setPinnedMarker(null)}
                aria-label="Dismiss"
                className="pressable ml-auto text-[var(--color-muted)] hover:text-[var(--color-heading)]"
              >
                ×
              </button>
            </div>
            <div className="text-[var(--color-muted)]">{pinnedMarkerData.label}</div>
            <div className="tnum mt-0.5 font-semibold text-[var(--color-heading)]">
              {money(pinnedMarkerData.close)}
            </div>
          </div>
        )}
      </div>

      {volumePanel && (
        <div className="mt-3">
          <div className="text-2xs mb-1 flex items-center justify-between font-mono tracking-[0.06em] text-[var(--color-muted)] uppercase">
            <span>Volume</span>
            {hover !== null && hover < visible.length && (
              <span className="tnum text-[var(--color-heading)] normal-case">
                {compact(visible[hover].volume ?? 0)}
              </span>
            )}
          </div>
          <svg viewBox={`0 0 ${W} ${VOLUME_H}`} className="w-full">
            {[volumePanel.max, volumePanel.max / 2].map((level) => (
              <g key={level}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={volumePanel.y(level)}
                  y2={volumePanel.y(level)}
                  stroke="var(--color-viz-grid)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={volumePanel.y(level) + 3}
                  textAnchor="end"
                  className="tnum"
                  fontSize={9}
                  fill="var(--color-viz-axis)"
                >
                  {compact(level)}
                </text>
              </g>
            ))}
            {volumePanel.bars.map((b) => (
              <rect
                key={b.key}
                x={b.x}
                y={b.y}
                width={b.width}
                height={Math.max(0.5, b.height)}
                fill={b.up ? "var(--color-positive)" : "var(--color-negative)"}
                fillOpacity={0.55}
              />
            ))}
            {hover !== null && hover < visible.length && (
              <line
                x1={chart.x(hover)}
                x2={chart.x(hover)}
                y1={SUB_PAD.top}
                y2={VOLUME_H - SUB_PAD.bottom}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
            )}
          </svg>
        </div>
      )}

      {rsiPanel && (
        <div className="mt-3">
          <div className="text-2xs mb-1 font-mono tracking-[0.06em] text-[var(--color-muted)] uppercase">
            RSI 14
          </div>
          <svg viewBox={`0 0 ${W} ${RSI_H}`} className="w-full">
            {[70, 30].map((level) => (
              <g key={level}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={rsiPanel.y(level)}
                  y2={rsiPanel.y(level)}
                  stroke="var(--color-viz-grid)"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                <text
                  x={PAD.left - 8}
                  y={rsiPanel.y(level) + 3}
                  textAnchor="end"
                  className="tnum"
                  fontSize={9}
                  fill="var(--color-viz-axis)"
                >
                  {level}
                </text>
              </g>
            ))}
            <path
              d={rsiPanel.line}
              fill="none"
              stroke="var(--color-viz-sma)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {hover !== null && hover < visible.length && (
              <line
                x1={chart.x(hover)}
                x2={chart.x(hover)}
                y1={SUB_PAD.top}
                y2={RSI_H - SUB_PAD.bottom}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
            )}
          </svg>
        </div>
      )}

      {macdPanel && (
        <div className="mt-3">
          <div className="text-2xs mb-1 flex items-center gap-3 font-mono tracking-[0.06em] text-[var(--color-muted)] uppercase">
            <span>MACD</span>
            <span className="inline-flex items-center gap-1 normal-case">
              <span
                className="inline-block h-0.5 w-3"
                style={{ background: "var(--color-viz-sma)" }}
              />
              MACD
            </span>
            <span className="inline-flex items-center gap-1 normal-case">
              <span
                className="inline-block h-0.5 w-3"
                style={{ background: "var(--color-viz-ema)" }}
              />
              Signal
            </span>
          </div>
          <svg viewBox={`0 0 ${W} ${MACD_H}`} className="w-full">
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={macdPanel.zeroY}
              y2={macdPanel.zeroY}
              stroke="var(--color-viz-grid)"
              strokeWidth={1}
            />
            {macdPanel.bars.map((b) => (
              <rect
                key={b.key}
                x={b.x}
                y={b.y}
                width={b.width}
                height={b.height}
                fill={b.up ? "var(--color-positive)" : "var(--color-negative)"}
                fillOpacity={0.45}
              />
            ))}
            <path
              d={macdPanel.macdLine}
              fill="none"
              stroke="var(--color-viz-sma)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={macdPanel.signalLine}
              fill="none"
              stroke="var(--color-viz-ema)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {hover !== null && hover < visible.length && (
              <line
                x1={chart.x(hover)}
                x2={chart.x(hover)}
                y1={SUB_PAD.top}
                y2={MACD_H - SUB_PAD.bottom}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
            )}
          </svg>
        </div>
      )}

      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[var(--color-body)]">
        {chartType === "candle" ? (
          <>
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-[2px]"
                style={{ background: "var(--color-positive)" }}
              />
              Up
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-[2px]"
                style={{ background: "var(--color-negative)" }}
              />
              Down
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-4"
              style={{ background: "var(--color-viz-price)" }}
            />
            {intraday ? "Price" : "Daily close"}
          </span>
        )}
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
        {chart.markers.length > 0 && (
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
