"use client";

import { useState } from "react";

import type { EarningsHistoryRow } from "@/lib/api";
import { formatDate, formatDateShort, pct, pctSigned } from "@/lib/format";

/**
 * Paired columns: what options priced in, against what the stock actually did.
 *
 * This is the single most useful visual in the app. A name whose ochre column
 * is consistently shorter than its indigo one is a chronic overpricer — the
 * market keeps charging for a move that doesn't arrive. That pattern is
 * invisible in a table of numbers and obvious here.
 *
 * The realized move is plotted as a MAGNITUDE (absolute value), because the
 * comparison is against a symmetric ±X% implied move. Direction is carried
 * separately in the tooltip's signed figure, not smuggled into this chart's
 * height — a -8% move and a +8% move are equally "bigger than implied".
 *
 * Hover uses a floating HTML tooltip (matching PriceChart) rather than inline
 * SVG text: SVG text anchored "middle" clips against the chart edges for the
 * first/last bar and can't fade in, which is what read as "odd" here.
 */

const H = 220;
const PAD = { top: 16, right: 10, bottom: 34, left: 48 };
const MAX_BAR = 24; // never fill the slot — leftover band is air
const W = 800;

interface Point {
  date: string;
  implied: number;
  realized: number;
  signed: number;
  beatImplied: boolean;
}

export function ImpliedVsRealized({ rows }: { rows: EarningsHistoryRow[] }) {
  const [hover, setHover] = useState<number | null>(null);

  // Only quarters where we have both numbers can be compared.
  const data: Point[] = rows
    .filter((r) => typeof r.implied_move === "number" && typeof r.realized_move === "number")
    .map((r) => {
      const realized = Math.abs(r.realized_move as number);
      const implied = r.implied_move as number;
      return {
        date: r.report_date,
        implied,
        realized,
        signed: r.realized_move as number,
        beatImplied: realized > implied,
      };
    })
    .reverse(); // oldest -> newest, so time reads left to right

  if (data.length === 0) {
    return (
      <p className="py-8 text-sm text-[var(--color-muted)]">
        No quarter yet has both an implied move and a scored outcome. This fills in as the
        engine scores each print.
      </p>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const max = Math.max(...data.flatMap((d) => [d.implied, d.realized])) * 1.15;
  const band = plotW / data.length;
  const barW = Math.min(MAX_BAR, (band - 10) / 2);
  const y = (v: number) => PAD.top + (1 - v / max) * plotH;

  const ticks = [0, max / 2, max];
  const point = hover !== null ? data[hover] : null;
  const hoverCx = hover !== null ? PAD.left + band * hover + band / 2 : 0;

  // Clamp the tooltip's horizontal position so it never clips past the chart
  // edge for the first/last bar — the exact issue the old inline SVG label had.
  const tooltipLeftPct = Math.min(92, Math.max(8, (hoverCx / W) * 100));

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Implied versus realized move for the last ${data.length} earnings reports.`}
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
                {(t * 100).toFixed(0)}%
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
            // 2px surface gap between the touching pair — the gap does the
            // separating, not a stroke.
            const impliedX = cx - barW - 1;
            const realizedX = cx + 1;
            const base = y(0);
            const dimmed = hover !== null && hover !== i;

            return (
              <g
                key={d.date}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {/* Invisible full-height hit target: bigger than the marks. */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                />

                <rect
                  x={impliedX}
                  y={y(d.implied)}
                  width={barW}
                  height={base - y(d.implied)}
                  rx={2}
                  fill="var(--color-viz-implied)"
                  className="transition-opacity duration-[var(--duration-fast)]"
                  opacity={dimmed ? 0.35 : 1}
                />
                <rect
                  x={realizedX}
                  y={y(d.realized)}
                  width={barW}
                  height={base - y(d.realized)}
                  rx={2}
                  fill="var(--color-viz-realized)"
                  className="transition-opacity duration-[var(--duration-fast)]"
                  opacity={dimmed ? 0.35 : 1}
                />

                <text
                  x={cx}
                  y={H - 20}
                  textAnchor="middle"
                  fontSize={10}
                  fill={hover === i ? "var(--color-heading)" : "var(--color-viz-axis)"}
                  fontWeight={hover === i ? 600 : 400}
                >
                  {formatDateShort(d.date)}
                </text>
              </g>
            );
          })}
        </svg>

        {point && (
          // Popover anchored to the bar it describes, scaling from the
          // bottom since it floats above the hovered pair — the same
          // origin-aware entrance PriceChart and the search dropdown use.
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
                style={{ background: "var(--color-viz-implied)" }}
              />
              <span className="text-[var(--color-muted)]">Implied</span>
              <span className="ml-auto font-medium text-[var(--color-heading)]">
                {pct(point.implied)}
              </span>
            </div>
            <div className="tnum flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-[1px]"
                style={{ background: "var(--color-viz-realized)" }}
              />
              <span className="text-[var(--color-muted)]">Actual</span>
              <span className="ml-auto font-medium text-[var(--color-heading)]">
                {pctSigned(point.signed)}
              </span>
            </div>
            <div
              className={`mt-1 border-t border-[var(--color-border-subtle)] pt-1 font-mono tracking-[0.06em] text-[var(--text-2xs)] uppercase ${
                point.beatImplied
                  ? "text-[var(--color-verdict-cheap)]"
                  : "text-[var(--color-verdict-rich)]"
              }`}
            >
              {point.beatImplied ? "Beat the implied move" : "Inside the implied move"}
            </div>
          </div>
        )}
      </div>

      {/* A legend is always present for two or more series — identity must
          never rest on colour-matching alone. */}
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[var(--color-muted)]">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--color-viz-implied)" }}
          />
          Implied (what options priced)
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-[2px]"
            style={{ background: "var(--color-viz-realized)" }}
          />
          Realized (what happened)
        </span>
      </figcaption>
    </figure>
  );
}
