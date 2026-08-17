"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Panel, StatCard } from "@/components/Panel";
import {
  blackScholesPrice,
  breakevenAtExpiry,
  CONTRACT_MULTIPLIER,
  positionPnl,
  type OptionType,
} from "@/lib/blackScholes";
import { EMPTY, formatDateShort, money, num, pct } from "@/lib/format";

interface ChainContract {
  strike: number;
  expiry: string;
  type: OptionType;
  price: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  open_interest: number | null;
}

type ChainState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; spot: number; contracts: ChainContract[] }
  | { status: "error"; message: string };

const fieldClass =
  "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1.5 text-sm text-[var(--color-heading)] focus:border-[var(--color-brand)] focus:outline-none";

const W = 700;
const H = 300;
const PAD = { top: 12, right: 16, bottom: 28, left: 56 };
const SAMPLES = 81;

/** Calendar days between two ISO dates — a rounding error next to the IV
 * crush assumption, so no need for a trading-calendar-aware version here. */
function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = toIso.slice(0, 10).split("-").map(Number);
  return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * A single-leg (long call or long put) earnings-day P&L simulator. Deliberately
 * not a full chain/spread builder — see the backlog note this shipped against.
 *
 * Two curves on one chart, the same thing optionsprofitcalculator.com and
 * optionsmath.com show: the hard-kinked payoff AT expiration (pure intrinsic
 * value, no time value left), and a smooth Black-Scholes re-pricing for the
 * day right after the print, at whatever IV the user assumes survives the
 * crush. That second curve is the one that actually matters for an earnings
 * trade — most positions here are closed the next session, not held to
 * expiration.
 */
export function OptionsSimulator({
  ticker,
  reportDate,
  reportSession,
}: {
  ticker: string;
  reportDate: string | null;
  reportSession: string | null;
}) {
  const [state, setState] = useState<ChainState>({ status: "idle" });
  const [expiry, setExpiry] = useState("");
  const [strike, setStrike] = useState<number | null>(null);
  const [optionType, setOptionType] = useState<OptionType>("call");
  const [contracts, setContracts] = useState(1);
  const [entryPriceText, setEntryPriceText] = useState("");
  const [ivCrushPct, setIvCrushPct] = useState(55);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  async function loadChain() {
    if (!reportDate) return;
    setState({ status: "loading" });
    try {
      const res = await fetch(
        `/api/chain?ticker=${encodeURIComponent(ticker)}&report_date=${reportDate}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      );
      const body = await res.json();
      if (!res.ok) {
        setState({ status: "error", message: body.error ?? `Request failed (${res.status}).` });
        return;
      }
      const contracts: ChainContract[] = body.contracts ?? [];
      setState({ status: "done", spot: body.spot, contracts });

      // Seed the picker with a sensible default: front expiry, the strike
      // nearest spot, a call — so the chart has something to show immediately
      // rather than three empty dropdowns.
      const expiries = [...new Set(contracts.map((c) => c.expiry))].sort();
      const frontExpiry = expiries[0];
      if (frontExpiry) {
        setExpiry(frontExpiry);
        const calls = contracts.filter((c) => c.expiry === frontExpiry && c.type === "call");
        const nearest = calls.reduce<ChainContract | null>((best, c) => {
          if (!best) return c;
          return Math.abs(c.strike - body.spot) < Math.abs(best.strike - body.spot) ? c : best;
        }, null);
        if (nearest) setStrike(nearest.strike);
      }
    } catch {
      setState({ status: "error", message: "Couldn't reach the options data provider." });
    }
  }

  const expiries = useMemo(
    () =>
      state.status === "done" ? [...new Set(state.contracts.map((c) => c.expiry))].sort() : [],
    [state],
  );

  const strikesForExpiry = useMemo(() => {
    if (state.status !== "done") return [];
    return [
      ...new Set(state.contracts.filter((c) => c.expiry === expiry).map((c) => c.strike)),
    ].sort((a, b) => a - b);
  }, [state, expiry]);

  const selectedContract = useMemo(() => {
    if (state.status !== "done" || strike === null) return null;
    return (
      state.contracts.find(
        (c) => c.expiry === expiry && c.strike === strike && c.type === optionType,
      ) ?? null
    );
  }, [state, expiry, strike, optionType]);

  const spot = state.status === "done" ? state.spot : null;
  const entryPremium =
    entryPriceText.trim() !== "" && !Number.isNaN(Number(entryPriceText))
      ? Number(entryPriceText)
      : (selectedContract?.price ?? null);
  const entryIv = selectedContract?.iv ?? null;

  const scenario = useMemo(() => {
    if (spot === null || strike === null || entryPremium === null || !expiry) return null;

    const today = todayIso();

    // "Right after the print" — same session for BMO (reacts against that
    // day's own close), the next session for AMC/unknown — the identical
    // convention TickerTabs' History table already uses for its price
    // before/after columns, not a new rule invented for this chart.
    const postPrintDate = reportDate
      ? reportSession === "BMO"
        ? reportDate
        : addDays(reportDate, 1)
      : today;
    const yearsToExpiryPostPrint = Math.max(0, daysBetween(postPrintDate, expiry)) / 365;
    const postPrintIv = entryIv !== null ? entryIv * (ivCrushPct / 100) : null;

    const lo = spot * 0.7;
    const hi = spot * 1.3;
    const points: {
      spot: number;
      atExpiry: number;
      postPrint: number | null;
    }[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const s = lo + ((hi - lo) * i) / (SAMPLES - 1);
      const atExpiry = positionPnl(
        { type: optionType, strike, entryPremium, contracts, yearsToExpiry: 0, iv: 0 },
        s,
      ).pnl;
      const postPrint =
        postPrintIv !== null
          ? positionPnl(
              {
                type: optionType,
                strike,
                entryPremium,
                contracts,
                yearsToExpiry: yearsToExpiryPostPrint,
                iv: postPrintIv,
              },
              s,
            ).pnl
          : null;
      points.push({ spot: s, atExpiry, postPrint });
    }

    const entryCost = entryPremium * contracts * CONTRACT_MULTIPLIER;
    const breakeven = breakevenAtExpiry(optionType, strike, entryPremium);
    const postPrintValueAtSpot =
      postPrintIv !== null
        ? blackScholesPrice({
            type: optionType,
            spot,
            strike,
            yearsToExpiry: yearsToExpiryPostPrint,
            iv: postPrintIv,
          })
        : null;

    return {
      points,
      entryCost,
      breakeven,
      postPrintIv,
      postPrintDate,
      postPrintPnlAtCurrentSpot:
        postPrintValueAtSpot !== null
          ? postPrintValueAtSpot * contracts * CONTRACT_MULTIPLIER - entryCost
          : null,
    };
  }, [
    spot,
    strike,
    entryPremium,
    expiry,
    optionType,
    contracts,
    entryIv,
    ivCrushPct,
    reportDate,
    reportSession,
  ]);

  if (!reportDate) {
    return (
      <Panel
        title="Options P&L simulator"
        empty="No confirmed earnings date. Nothing to simulate yet."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Build a trade"
        subtitle="Single-leg only — one call or put, long. Loads a live chain (metered, so it's a click, not automatic)."
      >
        {state.status !== "done" ? (
          <div>
            <button
              type="button"
              onClick={loadChain}
              disabled={state.status === "loading"}
              className="pressable rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel-soft)] px-4 py-2 text-sm font-medium text-[var(--color-heading)] transition-colors hover:bg-[var(--color-border)] disabled:opacity-50"
            >
              {state.status === "loading" ? "Loading chain…" : "Load live chain"}
            </button>
            {state.status === "error" && (
              <p className="mt-3 text-sm text-[var(--color-warning)]">{state.message}</p>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="eyebrow mb-1.5 block text-[var(--color-muted)]">
                Expiration
              </label>
              <select
                value={expiry}
                onChange={(e) => {
                  setExpiry(e.target.value);
                  setStrike(null);
                  setEntryPriceText("");
                }}
                className={fieldClass}
              >
                {expiries.map((exp) => (
                  <option key={exp} value={exp}>
                    {formatDateShort(exp)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="eyebrow mb-1.5 block text-[var(--color-muted)]">Strike</label>
              <select
                value={strike ?? ""}
                onChange={(e) => {
                  setStrike(Number(e.target.value));
                  setEntryPriceText("");
                }}
                className={fieldClass}
              >
                <option value="" disabled>
                  Pick a strike
                </option>
                {strikesForExpiry.map((s) => (
                  <option key={s} value={s}>
                    {money(s, 2)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="eyebrow mb-1.5 block text-[var(--color-muted)]">Type</label>
              <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
                {(["call", "put"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setOptionType(t);
                      setEntryPriceText("");
                    }}
                    aria-pressed={optionType === t}
                    className={`pressable rounded-[3px] px-3 py-1 text-sm font-medium capitalize transition-colors ${
                      optionType === t
                        ? "bg-[var(--color-panel-soft)] text-[var(--color-heading)]"
                        : "text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="eyebrow mb-1.5 block text-[var(--color-muted)]">
                Contracts
              </label>
              <input
                type="number"
                min={1}
                max={1000}
                value={contracts}
                onChange={(e) => setContracts(Math.max(1, Number(e.target.value) || 1))}
                className={`${fieldClass} w-20`}
              />
            </div>

            <div>
              <label className="eyebrow mb-1.5 block text-[var(--color-muted)]">
                Entry price / share
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder={
                  selectedContract?.price != null ? money(selectedContract.price) : "—"
                }
                value={entryPriceText}
                onChange={(e) => setEntryPriceText(e.target.value)}
                className={`${fieldClass} w-28`}
              />
            </div>
          </div>
        )}
      </Panel>

      {state.status === "done" && scenario && strike !== null && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Entry cost"
              value={money(scenario.entryCost)}
              hint="Premium × contracts × 100."
            />
            <StatCard
              label="Breakeven at expiry"
              value={money(scenario.breakeven)}
              hint="The stock price where intrinsic value exactly equals the premium paid."
            />
            <StatCard
              label="Entry IV"
              value={entryIv !== null ? pct(entryIv, 0) : EMPTY}
              hint="This contract's implied volatility as quoted right now."
            />
            <StatCard
              label="Entry delta"
              value={
                selectedContract?.delta !== null && selectedContract?.delta !== undefined
                  ? num(selectedContract.delta, 2)
                  : EMPTY
              }
              hint="This contract's delta as quoted right now — a local slope, not what this simulator's curves are built from."
            />
          </div>

          <Panel
            title={`PnL at each price — ${formatDateShort(expiry)}`}
            subtitle={`Green = profit, red = loss, at expiration. Dashed line = the day after the print (${formatDateShort(scenario.postPrintDate)}), assuming IV lands at ${ivCrushPct}% of today's ${entryIv !== null ? pct(entryIv, 0) : "entry"} level.`}
          >
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label className="eyebrow shrink-0 text-[var(--color-muted)]">
                Post-print IV assumption
              </label>
              <input
                type="range"
                min={20}
                max={150}
                value={ivCrushPct}
                onChange={(e) => setIvCrushPct(Number(e.target.value))}
                className="w-full max-w-48 accent-[var(--color-viz-realized)]"
              />
              <span className="tnum text-sm text-[var(--color-heading)]">{ivCrushPct}%</span>
              <span className="text-2xs w-full text-[var(--color-muted)] sm:w-auto">
                (100% = no crush; above 100% models IV expanding further)
              </span>
            </div>

            <PayoffChart
              points={scenario.points}
              spot={spot!}
              hoverIdx={hoverIdx}
              onHover={setHoverIdx}
            />

            <p className="mt-4 text-sm text-[var(--color-muted)]">
              This is a model output, not a prediction. It re-prices the option with
              Black-Scholes at a hypothetical spot and IV — it does not know what the stock will
              actually do. American-style early exercise isn&rsquo;t modeled.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}

function PayoffChart({
  points,
  spot,
  hoverIdx,
  onHover,
}: {
  points: { spot: number; atExpiry: number; postPrint: number | null }[];
  spot: number;
  hoverIdx: number | null;
  onHover: (idx: number | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const chart = useMemo(() => {
    const values = points.flatMap((p) => [
      p.atExpiry,
      ...(p.postPrint !== null ? [p.postPrint] : []),
    ]);
    const minY = Math.min(0, ...values);
    const maxY = Math.max(0, ...values);
    const padY = (maxY - minY) * 0.08 || 1;
    const yLo = minY - padY;
    const yHi = maxY + padY;

    const xLo = points[0].spot;
    const xHi = points[points.length - 1].spot;

    const x = (s: number) => PAD.left + ((s - xLo) / (xHi - xLo)) * (W - PAD.left - PAD.right);
    const y = (v: number) =>
      PAD.top + (1 - (v - yLo) / (yHi - yLo)) * (H - PAD.top - PAD.bottom);

    const atExpiryPath = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.spot)},${y(p.atExpiry)}`)
      .join(" ");
    const postPrintPath = points.every((p) => p.postPrint !== null)
      ? points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.spot)},${y(p.postPrint!)}`).join(" ")
      : null;

    const zeroY = y(0);
    const spotX = x(spot);

    // The area between the "at expiration" line and the zero baseline —
    // closed back along the baseline so it can be filled, then clipped into
    // a green (profit) half and a red (loss) half below.
    const plotLeft = PAD.left;
    const plotRight = W - PAD.right;
    const atExpiryArea =
      `M${plotLeft},${zeroY} ` +
      points.map((p) => `L${x(p.spot)},${y(p.atExpiry)}`).join(" ") +
      ` L${plotRight},${zeroY} Z`;

    // Gridlines at round-ish P&L levels, not raw min/max — matches the
    // "recessive grid, real ticks" rule the price chart already follows.
    const ticks: number[] = [];
    const step = (yHi - yLo) / 4;
    for (let i = 0; i <= 4; i++) ticks.push(yLo + step * i);

    return {
      x,
      y,
      atExpiryPath,
      atExpiryArea,
      postPrintPath,
      zeroY,
      spotX,
      ticks,
      xLo,
      xHi,
      plotLeft,
      plotRight,
    };
  }, [points, spot]);

  const point = hoverIdx !== null ? points[hoverIdx] : null;

  function hoverFromClientX(clientX: number, rect: DOMRect) {
    const localX = ((clientX - rect.left) / rect.width) * W;
    const frac = (localX - PAD.left) / (W - PAD.left - PAD.right);
    const idx = Math.round(frac * (points.length - 1));
    onHover(Math.max(0, Math.min(points.length - 1, idx)));
  }

  // A React onTouchMove prop is attached passive — preventDefault() inside it
  // is silently ignored, so a finger dragging horizontally across the chart
  // would scroll the page instead of moving the crosshair. A native listener
  // registered with { passive: false } is the only way to actually claim the
  // gesture — same escape hatch PriceChart's touch handling uses.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length !== 1) return;
      hoverFromClientX(e.touches[0].clientX, el.getBoundingClientRect());
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length !== 1) return;
      hoverFromClientX(e.touches[0].clientX, el.getBoundingClientRect());
    };
    const onTouchEnd = () => onHover(null);

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

  const gainClip = `payoff-gain-${chart.zeroY.toFixed(1)}`;
  const lossClip = `payoff-loss-${chart.zeroY.toFixed(1)}`;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label="P&L versus hypothetical stock price at expiration and the day after the print"
        onMouseLeave={() => onHover(null)}
        onMouseMove={(e) =>
          hoverFromClientX(e.clientX, e.currentTarget.getBoundingClientRect())
        }
      >
        <defs>
          <clipPath id={gainClip}>
            <rect
              x={chart.plotLeft}
              y={PAD.top}
              width={chart.plotRight - chart.plotLeft}
              height={Math.max(0, chart.zeroY - PAD.top)}
            />
          </clipPath>
          <clipPath id={lossClip}>
            <rect
              x={chart.plotLeft}
              y={chart.zeroY}
              width={chart.plotRight - chart.plotLeft}
              height={Math.max(0, H - PAD.bottom - chart.zeroY)}
            />
          </clipPath>
        </defs>

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
              {t >= 0 ? "+" : ""}
              {Math.round(t)}
            </text>
          </g>
        ))}

        {/* Zero line, heavier than the gridlines — the actual breakeven boundary. */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={chart.zeroY}
          y2={chart.zeroY}
          stroke="var(--color-border)"
          strokeWidth={1.5}
        />

        {/* Current spot marker. */}
        <line
          x1={chart.spotX}
          x2={chart.spotX}
          y1={PAD.top}
          y2={H - PAD.bottom}
          stroke="var(--color-border)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text
          x={chart.spotX}
          y={H - PAD.bottom + 16}
          textAnchor="middle"
          className="tnum"
          fontSize={10}
          fill="var(--color-viz-axis)"
        >
          spot {money(spot, 0)}
        </text>

        {/* "At expiration" — the primary curve. Colored by sign (status),
            not by series identity: green where the position is profitable,
            red where it isn't, matching the y=0 line every reader already
            treats as the breakeven boundary. */}
        <path
          d={chart.atExpiryArea}
          fill="var(--color-positive)"
          opacity={0.12}
          clipPath={`url(#${gainClip})`}
        />
        <path
          d={chart.atExpiryArea}
          fill="var(--color-negative)"
          opacity={0.12}
          clipPath={`url(#${lossClip})`}
        />
        <path
          d={chart.atExpiryPath}
          fill="none"
          stroke="var(--color-positive)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath={`url(#${gainClip})`}
        />
        <path
          d={chart.atExpiryPath}
          fill="none"
          stroke="var(--color-negative)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath={`url(#${lossClip})`}
        />

        {/* "Day after the print" — a second point in time for the same
            position, not a sign indicator, so it stays one neutral hue and
            is told apart by line style (dashed) instead of color. */}
        {chart.postPrintPath && (
          <path
            d={chart.postPrintPath}
            fill="none"
            stroke="var(--color-viz-realized)"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {hoverIdx !== null && (
          <line
            x1={chart.x(points[hoverIdx].spot)}
            x2={chart.x(points[hoverIdx].spot)}
            y1={PAD.top}
            y2={H - PAD.bottom}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        )}
      </svg>

      {point && (
        <div
          className="pointer-events-none absolute top-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1.5 text-xs"
          style={{ left: `${(chart.x(point.spot) / W) * 100}%`, transform: "translateX(-50%)" }}
        >
          <div className="tnum font-semibold text-[var(--color-heading)]">
            {money(point.spot)}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className={`inline-block h-0.5 w-3 ${point.atExpiry >= 0 ? "bg-[var(--color-positive)]" : "bg-[var(--color-negative)]"}`}
            />
            <span
              className={`tnum ${point.atExpiry >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}
            >
              {point.atExpiry >= 0 ? "+" : ""}
              {money(point.atExpiry)}
            </span>
          </div>
          {point.postPrint !== null && (
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-3"
                style={{ background: "var(--color-viz-realized)" }}
              />
              <span
                className={`tnum ${point.postPrint >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}
              >
                {point.postPrint >= 0 ? "+" : ""}
                {money(point.postPrint)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[var(--color-body)]">
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex h-2 w-4 overflow-hidden rounded-[2px]">
            <span className="h-full w-1/2 bg-[var(--color-positive)]" />
            <span className="h-full w-1/2 bg-[var(--color-negative)]" />
          </span>
          At expiration (green = profit, red = loss)
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="16" height="8" className="shrink-0">
            <line
              x1={0}
              y1={4}
              x2={16}
              y2={4}
              stroke="var(--color-viz-realized)"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          </svg>
          Day after the print
        </span>
      </div>
    </div>
  );
}
