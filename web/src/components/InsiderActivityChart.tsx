"use client";

import { useMemo, useState } from "react";

import { EMPTY, compact, formatDateShort, money, moneyCompact } from "@/lib/format";
import type { InsiderTransaction } from "@/lib/useInsiders";
import type { PricePoint } from "@/lib/types";

/**
 * Insider trades plotted against the price they were made at — the shape
 * the table below can't show: whether the selling clustered into a top,
 * whether anyone bought a dip, whether it's one person repeatedly or the
 * whole board at once.
 *
 * Price is the line (left axis), each trade is a bar (right axis, by
 * dollar value). Buys and sells get --color-positive/--color-negative,
 * the same categorical pair the open-interest chart and candles already
 * use, so the meaning carries over without re-teaching it.
 *
 * Bars are drawn at the transaction date's position on the SAME x-scale as
 * the price line, so a bar physically sits under the price it happened at.
 * Trades older than the price window are dropped rather than clamped to
 * the left edge — a bar pinned to the axis would claim a date it didn't
 * happen on.
 */

const W = 800;
const H = 260;
const PAD = { top: 14, right: 14, bottom: 30, left: 54 };
const MIN_BAR_H = 2;
const MAX_BAR_W = 10;
const X_TICKS = 6;

interface Trade {
  date: string;
  value: number;
  isBuy: boolean;
  owner: string | null;
  shares: number | null;
  price: number | null;
}

/** ISO date -> fractional position in [0,1] across the price window. */
function datePos(iso: string, firstMs: number, spanMs: number): number | null {
  const t = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  const frac = (t - firstMs) / spanMs;
  return frac < 0 || frac > 1 ? null : frac;
}

export function InsiderActivityChart({
  transactions,
  prices,
}: {
  transactions: InsiderTransaction[];
  prices: PricePoint[];
}) {
  const [hover, setHover] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (prices.length < 2) return null;

    const firstMs = new Date(`${prices[0].date}T00:00:00`).getTime();
    const lastMs = new Date(`${prices[prices.length - 1].date}T00:00:00`).getTime();
    const spanMs = lastMs - firstMs;
    if (!Number.isFinite(spanMs) || spanMs <= 0) return null;

    const closes = prices.map((p) => p.close);
    const pMin = Math.min(...closes);
    const pMax = Math.max(...closes);
    const pSpan = pMax - pMin || Math.max(pMax * 0.02, 0.01);
    const pLo = pMin - pSpan * 0.08;
    const pHi = pMax + pSpan * 0.08;

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const x = (frac: number) => PAD.left + frac * plotW;
    const yPrice = (v: number) => PAD.top + (1 - (v - pLo) / (pHi - pLo)) * plotH;

    const line = prices
      .map((p, i) => {
        const frac = (new Date(`${p.date}T00:00:00`).getTime() - firstMs) / spanMs;
        return `${i === 0 ? "M" : "L"}${x(frac)} ${yPrice(p.close)}`;
      })
      .join(" ");

    // Only trades with both a date and a dollar value can be positioned and
    // sized — a Form 4 row missing either can't be drawn honestly.
    const trades: Trade[] = transactions
      .filter((t) => t.transaction_date && typeof t.value === "number" && t.value > 0)
      .map((t) => ({
        date: t.transaction_date!,
        value: t.value!,
        isBuy: t.acquired_or_disposed === "A",
        owner: t.owner_name,
        shares: t.shares,
        price: t.price_per_share,
      }));

    const positioned = trades
      .map((t) => ({ t, frac: datePos(t.date, firstMs, spanMs) }))
      .filter((r): r is { t: Trade; frac: number } => r.frac !== null);

    if (positioned.length === 0) return null;

    const maxValue = Math.max(...positioned.map((r) => r.t.value));
    const baseline = PAD.top + plotH;
    const barW = Math.min(MAX_BAR_W, Math.max(2, plotW / Math.max(positioned.length, 24) / 1.5));

    // Square-root scale, not linear. Insider trade sizes span orders of
    // magnitude — a 10%-owner trust unloading $467M next to executives
    // selling $200K each. Linear makes the outlier the only visible bar and
    // flattens every other trade to a 1px sliver, losing the pattern the
    // chart exists to show. sqrt keeps the outlier clearly dominant (~39x
    // taller here rather than ~1500x) while the rest stay readable. The
    // caption says so, since a non-linear axis the reader can't see is a
    // way to mislead with a true number.
    const scale = (v: number) => Math.sqrt(v / maxValue);

    const bars = positioned.map(({ t, frac }, i) => {
      const h = Math.max(MIN_BAR_H, scale(t.value) * plotH * 0.8);
      return {
        i,
        trade: t,
        cx: x(frac),
        x: x(frac) - barW / 2,
        y: baseline - h,
        width: barW,
        height: h,
      };
    });

    const priceTicks = [pLo + (pHi - pLo) * 0.08, (pLo + pHi) / 2, pHi - (pHi - pLo) * 0.08];

    const tickCount = Math.min(X_TICKS, prices.length);
    const dateTicks = Array.from({ length: tickCount }, (_, i) => {
      const idx = Math.round((i / Math.max(1, tickCount - 1)) * (prices.length - 1));
      const frac = (new Date(`${prices[idx].date}T00:00:00`).getTime() - firstMs) / spanMs;
      return { x: x(frac), label: formatDateShort(prices[idx].date) };
    });

    const buyTotal = positioned.filter((r) => r.t.isBuy).reduce((s, r) => s + r.t.value, 0);
    const sellTotal = positioned.filter((r) => !r.t.isBuy).reduce((s, r) => s + r.t.value, 0);

    return { line, bars, priceTicks, dateTicks, yPrice, maxValue, baseline, buyTotal, sellTotal };
  }, [transactions, prices]);

  if (!chart) {
    return (
      <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
        Not enough overlapping price and filing history to chart.
      </p>
    );
  }

  const active = hover !== null ? chart.bars[hover] : null;

  return (
    <figure className="m-0 px-5 py-4">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="Insider buys and sells plotted against the share price over the last year."
        >
          {chart.priceTicks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={chart.yPrice(t)}
                y2={chart.yPrice(t)}
                stroke="var(--color-viz-grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={chart.yPrice(t) + 3}
                textAnchor="end"
                className="tnum"
                fontSize={10}
                fill="var(--color-viz-axis)"
              >
                ${t.toFixed(0)}
              </text>
            </g>
          ))}

          {chart.dateTicks.map((t, i) => (
            <text
              key={i}
              x={t.x}
              y={H - PAD.bottom + 16}
              textAnchor={i === 0 ? "start" : i === chart.dateTicks.length - 1 ? "end" : "middle"}
              fontSize={10}
              fill="var(--color-viz-axis)"
            >
              {t.label}
            </text>
          ))}

          {/* Bars under the price line: the line is the primary series and
              shouldn't be interrupted by them. */}
          {chart.bars.map((b) => (
            <rect
              key={b.i}
              x={b.x}
              y={b.y}
              width={b.width}
              height={b.height}
              rx={1}
              fill={b.trade.isBuy ? "var(--color-positive)" : "var(--color-negative)"}
              opacity={hover === null || hover === b.i ? 0.75 : 0.3}
              className="transition-opacity duration-[var(--duration-fast)]"
              onMouseEnter={() => setHover(b.i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}

          <path
            d={chart.line}
            fill="none"
            stroke="var(--color-viz-price)"
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-0 w-max max-w-56 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-2 text-xs"
            style={{
              left: `${Math.min(88, Math.max(12, (active.cx / W) * 100))}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="mb-1 border-b border-[var(--color-border-subtle)] pb-1 text-[var(--color-muted)]">
              {formatDateShort(active.trade.date)}
            </div>
            <div className="font-medium text-[var(--color-heading)]">
              {active.trade.owner ?? "Insider"}
            </div>
            <div
              className={`tnum mt-0.5 font-semibold ${
                active.trade.isBuy
                  ? "text-[var(--color-positive)]"
                  : "text-[var(--color-negative)]"
              }`}
            >
              {active.trade.isBuy ? "Bought" : "Sold"} {moneyCompact(active.trade.value)}
            </div>
            <div className="tnum mt-0.5 text-[var(--color-muted)]">
              {active.trade.shares !== null ? compact(active.trade.shares) : EMPTY} sh
              {active.trade.price !== null ? ` @ ${money(active.trade.price)}` : ""}
            </div>
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-[var(--color-body)]">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-0.5 w-4"
            style={{ background: "var(--color-viz-price)" }}
          />
          Share price
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--color-positive)" }}
          />
          Bought {moneyCompact(chart.buyTotal)}
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--color-negative)" }}
          />
          Sold {moneyCompact(chart.sellTotal)}
        </span>
        <span className="text-[var(--color-muted)]">
          Bar height = trade value (square-root scale)
        </span>
      </figcaption>
    </figure>
  );
}
