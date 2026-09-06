"use client";

import { useState } from "react";

import { barPath } from "@/lib/chartShapes";
import { compact, money } from "@/lib/format";

/**
 * Open interest by strike, calls vs puts, windowed around the ATM strike —
 * a liquidity map in the Webull sense, scoped to what an earnings-decision
 * reader actually wants: not a full chain, just "is there real size where
 * the money actually is."
 *
 * Calls/puts get --color-positive/--color-negative rather than a neutral
 * categorical pair: "call = bullish-green, put = bearish-red" is a
 * convention finance readers already carry in, and this app already uses
 * the same two tokens as a categorical fill pair for the candle chart's
 * up/down bars — there's precedent, not a new meaning being invented.
 */

interface StrikeRow {
  strike: number;
  call_oi: number;
  put_oi: number;
}

const H = 200;
const PAD = { top: 16, right: 10, bottom: 34, left: 48 };
const MAX_BAR = 22;
const W = 800;

/** A flat `money(strike, 0)` collapses $8.00 and $8.50 into the same "$8"
 * label — real for sub-$10 names with half-dollar strike increments (see
 * the strike ladder this fixed a duplicate on). Show the cents only when
 * the strike actually has a fractional part, so whole-dollar strikes stay
 * uncluttered and half-dollar ones stay distinct. */
function strikeLabel(strike: number): string {
  return Number.isInteger(strike) ? money(strike, 0) : money(strike, 2);
}

export function OpenInterestChart({
  rows,
  atmStrike,
}: {
  rows: StrikeRow[];
  atmStrike: number | null | undefined;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");

  if (rows.length === 0) {
    return (
      <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
        No per-strike open interest to chart yet.
      </p>
    );
  }

  const toggle = (
    <div className="mb-3 inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
      {(["chart", "table"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setView(v)}
          aria-pressed={view === v}
          className={`pressable rounded-[3px] px-2.5 py-1 text-sm font-medium capitalize transition-colors ${
            view === v
              ? "bg-[var(--color-panel-soft)] text-[var(--color-heading)]"
              : "text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)]"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );

  if (view === "table") {
    return (
      <div>
        {toggle}
        <div className="overflow-x-auto">
          <table className="tnum w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-table-head)] text-left">
                <th className="eyebrow px-4 py-2.5 font-medium">Strike</th>
                <th className="eyebrow px-4 py-2.5 font-medium">Call OI</th>
                <th className="eyebrow px-4 py-2.5 font-medium">Put OI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isAtm = atmStrike != null && Math.abs(r.strike - atmStrike) < 1e-6;
                return (
                  <tr
                    key={r.strike}
                    className={`border-b border-[var(--color-border-subtle)] last:border-b-0 ${
                      isAtm ? "bg-[var(--color-panel-soft)]" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-medium text-[var(--color-heading)]">
                      {strikeLabel(r.strike)}
                      {isAtm && (
                        <span className="eyebrow ml-1.5 text-[var(--color-muted)]">ATM</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-positive)]">
                      {compact(r.call_oi)}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-negative)]">
                      {compact(r.put_oi)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = Math.max(...rows.flatMap((r) => [r.call_oi, r.put_oi]), 1) * 1.15;
  const band = plotW / rows.length;
  const barW = Math.min(MAX_BAR, (band - 8) / 2);
  const y = (v: number) => PAD.top + (1 - v / max) * plotH;
  const base = y(0);

  const ticks = [0, max / 2, max];
  const point = hover !== null ? rows[hover] : null;
  const hoverCx = hover !== null ? PAD.left + band * hover + band / 2 : 0;
  const tooltipLeftPct = Math.min(92, Math.max(8, (hoverCx / W) * 100));

  return (
    <figure className="m-0">
      {toggle}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Open interest by strike, calls versus puts, across ${rows.length} strikes.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-viz-grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(t) + 3}
                textAnchor="end"
                className="tnum"
                fontSize={10}
                fill="var(--color-viz-axis)"
              >
                {compact(t)}
              </text>
            </g>
          ))}

          {hover !== null && (
            <line
              x1={hoverCx}
              x2={hoverCx}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
          )}

          {rows.map((r, i) => {
            const cx = PAD.left + band * i + band / 2;
            const callX = cx - barW - 1;
            const putX = cx + 1;
            const isAtm = atmStrike != null && Math.abs(r.strike - atmStrike) < 1e-6;
            const dimmed = hover !== null && hover !== i;

            return (
              <g
                key={r.strike}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                />

                <path
                  d={barPath(callX, y(r.call_oi), barW, base - y(r.call_oi), 3)}
                  fill="var(--color-positive)"
                  className="transition-opacity duration-[var(--duration-fast)]"
                  opacity={dimmed ? 0.35 : 1}
                />
                <path
                  d={barPath(putX, y(r.put_oi), barW, base - y(r.put_oi), 3)}
                  fill="var(--color-negative)"
                  className="transition-opacity duration-[var(--duration-fast)]"
                  opacity={dimmed ? 0.35 : 1}
                />

                <text
                  x={cx}
                  y={H - 20}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={isAtm || hover === i ? 600 : 400}
                  fill={
                    hover === i
                      ? "var(--color-heading)"
                      : isAtm
                        ? "var(--color-body)"
                        : "var(--color-viz-axis)"
                  }
                >
                  {strikeLabel(r.strike)}
                </text>
                {isAtm && (
                  <text
                    x={cx}
                    y={H - 8}
                    textAnchor="middle"
                    className="font-mono uppercase"
                    fontSize={9}
                    letterSpacing={0.6}
                    fill="var(--color-muted)"
                  >
                    ATM
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {point && (
          <div
            className="pointer-events-none absolute top-2 origin-bottom rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-2 text-xs opacity-100 transition-[opacity,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)] starting:scale-95 starting:opacity-0"
            style={{ left: `${tooltipLeftPct}%`, transform: "translateX(-50%)" }}
          >
            <div className="mb-1 border-b border-[var(--color-border-subtle)] pb-1 font-medium text-[var(--color-heading)]">
              {strikeLabel(point.strike)}
            </div>
            <div className="tnum flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-[1px]"
                style={{ background: "var(--color-positive)" }}
              />
              <span className="text-[var(--color-muted)]">Call OI</span>
              <span className="ml-auto font-medium text-[var(--color-heading)]">
                {compact(point.call_oi)}
              </span>
            </div>
            <div className="tnum flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-[1px]"
                style={{ background: "var(--color-negative)" }}
              />
              <span className="text-[var(--color-muted)]">Put OI</span>
              <span className="ml-auto font-medium text-[var(--color-heading)]">
                {compact(point.put_oi)}
              </span>
            </div>
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[var(--color-muted)]">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--color-positive)" }}
          />
          Call open interest
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--color-negative)" }}
          />
          Put open interest
        </span>
      </figcaption>
    </figure>
  );
}
