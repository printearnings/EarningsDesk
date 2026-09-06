"use client";

import { useState } from "react";

import { barPath } from "@/lib/chartShapes";
import { type FinancialsQuarter, periodLabel } from "@/lib/useFinancials";
import { formatDate, moneyCompact } from "@/lib/format";

// However many periods the table shows, the chart stays readable by only
// plotting the most recent slice — past this, paired bars get too thin to
// read (verified: 40 quarterly bars at this chart's width compress each bar
// under 5px).
const MAX_CHART_POINTS = 16;

/**
 * Paired columns: revenue against what actually reached the bottom line.
 * Modeled on ImpliedVsRealized's paired-bar chart — same interaction, same
 * "two series sharing one axis" reasoning, since revenue and net income are
 * both dollar magnitudes and a name whose net-income column keeps shrinking
 * against a flat-or-growing revenue column is a margin story a table of
 * numbers hides.
 *
 * Net income can be negative (a loss quarter), so unlike ImpliedVsRealized
 * the axis isn't pinned to a zero floor — it extends below zero whenever a
 * quarter needs it, with bars drawn from the zero baseline in either
 * direction rather than from the axis bottom.
 */

const H = 220;
const PAD = { top: 16, right: 10, bottom: 34, left: 52 };
const MAX_BAR = 24;
const W = 800;

interface Point {
  key: string;
  label: string;
  date: string;
  revenue: number | null;
  netIncome: number | null;
}

export function FinancialsChart({ quarters }: { quarters: FinancialsQuarter[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const data: Point[] = quarters
    .filter((q) => q.revenue !== null || q.net_income !== null)
    .slice(0, MAX_CHART_POINTS) // quarters/annual arrive newest-first
    .map((q) => ({
      key: q.period_end,
      label: periodLabel(q),
      date: q.period_end,
      revenue: q.revenue,
      netIncome: q.net_income,
    }))
    .reverse(); // oldest -> newest, so time reads left to right

  if (data.length === 0) {
    return (
      <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
        No revenue or net income figures to chart yet.
      </p>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const values = data
    .flatMap((d) => [d.revenue, d.netIncome])
    .filter((v): v is number => v !== null);
  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, 0);
  const max = rawMax * 1.15 || 1;
  const min = rawMin < 0 ? rawMin * 1.15 : 0;

  const band = plotW / data.length;
  const barW = Math.min(MAX_BAR, (band - 10) / 2);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH;
  const zeroY = y(0);

  const ticks = min < 0 ? [min, 0, max] : [0, max / 2, max];
  const point = hover !== null ? data[hover] : null;
  const hoverCx = hover !== null ? PAD.left + band * hover + band / 2 : 0;
  const tooltipLeftPct = Math.min(92, Math.max(8, (hoverCx / W) * 100));

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Revenue versus net income for the last ${data.length} quarters.`}
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
                {moneyCompact(t)}
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

          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const revenueX = cx - barW - 1;
            const netIncomeX = cx + 1;
            const dimmed = hover !== null && hover !== i;

            return (
              <g
                key={d.key}
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

                {d.revenue !== null && (
                  <path
                    d={barPath(
                      revenueX,
                      Math.min(y(d.revenue), zeroY),
                      barW,
                      Math.abs(zeroY - y(d.revenue)) || 1,
                      3,
                      d.revenue >= 0,
                    )}
                    fill="var(--color-viz-sma)"
                    className="transition-opacity duration-[var(--duration-fast)]"
                    opacity={dimmed ? 0.35 : 1}
                  />
                )}
                {d.netIncome !== null && (
                  <path
                    d={barPath(
                      netIncomeX,
                      Math.min(y(d.netIncome), zeroY),
                      barW,
                      Math.abs(zeroY - y(d.netIncome)) || 1,
                      3,
                      d.netIncome >= 0,
                    )}
                    fill={d.netIncome < 0 ? "var(--color-negative)" : "var(--color-viz-ema)"}
                    className="transition-opacity duration-[var(--duration-fast)]"
                    opacity={dimmed ? 0.35 : 1}
                  />
                )}

                <text
                  x={cx}
                  y={H - 20}
                  textAnchor="middle"
                  fontSize={10}
                  fill={hover === i ? "var(--color-heading)" : "var(--color-viz-axis)"}
                  fontWeight={hover === i ? 600 : 400}
                >
                  {d.label}
                </text>
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
              {formatDate(point.date)}
            </div>
            <div className="tnum flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-[1px]"
                style={{ background: "var(--color-viz-sma)" }}
              />
              <span className="text-[var(--color-muted)]">Revenue</span>
              <span className="ml-auto font-medium text-[var(--color-heading)]">
                {moneyCompact(point.revenue)}
              </span>
            </div>
            <div className="tnum flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-[1px]"
                style={{
                  background:
                    point.netIncome !== null && point.netIncome < 0
                      ? "var(--color-negative)"
                      : "var(--color-viz-ema)",
                }}
              />
              <span className="text-[var(--color-muted)]">Net income</span>
              <span className="ml-auto font-medium text-[var(--color-heading)]">
                {moneyCompact(point.netIncome)}
              </span>
            </div>
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[var(--color-muted)]">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--color-viz-sma)" }}
          />
          Revenue
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--color-viz-ema)" }}
          />
          Net income
        </span>
      </figcaption>
    </figure>
  );
}
