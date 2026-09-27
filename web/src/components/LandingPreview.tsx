"use client";

import Link from "next/link";
import { useState } from "react";

import { CompanyLogo } from "@/components/CompanyLogo";
import { countOutside, type PreviewTicker } from "@/lib/landing";
import { formatDate, formatDateShort, pctRange, pctSigned, sessionLabel } from "@/lib/format";

/**
 * The landing page's product demo: a row of "reporting soon" tickers, and a
 * card that shows the selected one the way its ticker page frames it. The
 * card shows what options are pricing for the next print, what the stock
 * typically moves, and each of its last eight prints against today's price.
 *
 * Everything here is real build-time data (see page.tsx), so this is the
 * product and not a mockup. The copy describes the numbers and never
 * says what to do with them.
 *
 * The comparison is each past print's realized move (magnitude) against
 * TODAY's implied move. That answers "would the move being priced now have
 * covered what this stock has actually done?". Per-quarter historical
 * implied moves are too sparse in the data to chart reliably.
 */

const VERDICT_COLOR: Record<string, string> = {
  RICH: "var(--l-rich)",
  CHEAP: "var(--l-cheap)",
  FAIR: "var(--l-fair)",
};

const VERDICT_MEANING: Record<string, string> = {
  RICH: "priced above its usual move",
  CHEAP: "priced below its usual move",
  FAIR: "priced near its usual move",
};

export function VerdictChip({
  verdict,
  className = "",
}: {
  verdict: string | null;
  className?: string;
}) {
  if (!verdict) return null;
  const color = VERDICT_COLOR[verdict] ?? "var(--l-fair)";
  return (
    <span
      className={`rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] leading-none font-semibold tracking-wide uppercase ${className}`}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 13%, transparent)`,
      }}
    >
      {verdict}
    </span>
  );
}

function readFor(t: PreviewTicker): string {
  const parts: string[] = [];
  const n = t.moves.length;
  if (t.typical) {
    const ratio = t.implied / t.typical;
    if (ratio >= 1.15) {
      parts.push(
        `Options are pricing ${pctRange(t.implied)}, about ${ratio.toFixed(1)}× the ${pctRange(t.typical)} ${t.ticker} has typically moved after earnings.`,
      );
    } else if (ratio <= 0.87) {
      parts.push(
        `Options are pricing ${pctRange(t.implied)}, less than the ${pctRange(t.typical)} ${t.ticker} has typically moved after earnings.`,
      );
    } else {
      parts.push(
        `Options are pricing ${pctRange(t.implied)}, close to the ${pctRange(t.typical)} ${t.ticker} has typically moved after earnings.`,
      );
    }
  } else {
    parts.push(`Options are pricing ${pctRange(t.implied)} for this print.`);
  }
  if (n > 0) {
    const k = countOutside(t);
    parts.push(
      k === 0
        ? `None of its last ${n} prints moved more than that.`
        : `${k} of its last ${n} prints moved more than that.`,
    );
  }
  return parts.join(" ");
}

export function LandingPreview({
  tickers,
  defaultIndex = 0,
}: {
  tickers: PreviewTicker[];
  defaultIndex?: number;
}) {
  const [active, setActive] = useState(defaultIndex);
  const t = tickers[active];
  if (!t) return null;

  const n = t.moves.length;
  const outside = countOutside(t);
  const ratio = t.typical ? t.implied / t.typical : null;
  const session = sessionLabel(t.session);

  return (
    <>
      {/* Reporting soon */}
      <div className="mt-10 flex w-full max-w-4xl flex-col items-center">
        <div className="mb-3 flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.18em] text-[var(--l-subtle)] uppercase">
            Reporting soon
          </span>
          <span className="h-px w-6 bg-[var(--l-line)]" />
        </div>
        <div className="flex w-full items-center justify-start gap-2 overflow-x-auto px-1 pb-2 sm:flex-wrap sm:justify-center">
          {tickers.map((p, i) => {
            const on = i === active;
            return (
              <button
                key={p.ticker}
                type="button"
                aria-pressed={on}
                onClick={() => setActive(i)}
                className={`pressable flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors ${
                  on
                    ? "border-[var(--l-accent)] bg-[var(--l-panel)] shadow-[0_0_14px_rgb(0_242_254_/_22%)]"
                    : "border-[var(--l-line)] bg-[var(--l-card)]/70 hover:border-[var(--l-accent)]/50 hover:bg-[var(--l-panel)]"
                }`}
              >
                <span
                  className={`font-mono text-xs font-bold ${on ? "text-[var(--l-accent)]" : "text-[var(--l-text)]"}`}
                >
                  {p.ticker}
                </span>
                <span className="tnum font-mono text-[11px] text-[var(--l-accent-soft)]">
                  {pctRange(p.implied)}
                </span>
                <VerdictChip verdict={p.verdict} className="!text-[9px]" />
                <span className="font-mono text-[10px] text-[var(--l-subtle)]">
                  {formatDateShort(p.reportDate)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The card */}
      <div className="relative mx-auto mt-10 w-full max-w-6xl text-left">
        <div
          className="pointer-events-none absolute -inset-1.5 rounded-3xl bg-gradient-to-r from-[var(--l-accent)]/15 via-[var(--l-accent-soft)]/8 to-transparent opacity-70 blur-xl"
          aria-hidden
        />
        <div className="relative overflow-hidden rounded-2xl border border-[var(--l-line)] bg-[var(--l-card)] shadow-[0_25px_60px_rgb(0_0_0_/_70%)]">
          {/* Header bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--l-line)] bg-[var(--l-surface)]/90 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--l-rich)]/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--l-outside)]/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--l-cheap)]/70" />
              </div>
              <span className="hidden h-3.5 w-px bg-[var(--l-line)] sm:block" />
              <CompanyLogo ticker={t.ticker} domain={t.domain} size={18} />
              <div className="flex min-w-0 items-center gap-2 font-mono text-xs font-semibold">
                <span className="tracking-wider text-[var(--l-accent)]">{t.ticker}</span>
                {t.name && (
                  <>
                    <span className="text-[var(--l-subtle)]">/</span>
                    <span className="truncate font-normal text-[var(--l-muted)]">{t.name}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden font-mono text-xs text-[var(--l-muted)] md:inline">
                Reports{" "}
                <span className="font-medium text-[var(--l-text)]">
                  {formatDate(t.reportDate)}
                </span>
                {session && <>, {session}</>}
              </span>
              <VerdictChip verdict={t.verdict} className="!px-2.5 !py-1 !text-[11px]" />
            </div>
          </div>

          <div className="grid grid-cols-1 divide-y divide-[var(--l-line)] lg:grid-cols-12 lg:divide-x lg:divide-y-0">
            {/* Left: numbers + chart */}
            <div className="flex flex-col justify-between p-5 sm:p-6 lg:col-span-8">
              <div>
                <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat
                    label="Priced in"
                    value={pctRange(t.implied)}
                    tone="var(--l-accent)"
                    hint={
                      t.expiry
                        ? `ATM straddle, ${formatDateShort(t.expiry)} expiry`
                        : "ATM straddle"
                    }
                  />
                  <Stat
                    label="Typical move"
                    value={t.typical ? pctRange(t.typical) : "No history"}
                    tone="var(--l-text)"
                    hint={n > 0 ? `Average of last ${n} prints` : "Not enough past prints"}
                  />
                  <Stat
                    label="Moved more"
                    value={n > 0 ? `${outside} of ${n}` : "No history"}
                    tone={outside > 0 ? "var(--l-outside)" : "var(--l-text)"}
                    hint="Past prints beyond today's price"
                  />
                  <Stat
                    label="Priced vs typical"
                    value={ratio ? `${ratio.toFixed(1)}×` : "Not enough data"}
                    tone={
                      t.verdict
                        ? (VERDICT_COLOR[t.verdict] ?? "var(--l-text)")
                        : "var(--l-text)"
                    }
                    hint={t.verdict ? `${t.verdict}: ${VERDICT_MEANING[t.verdict] ?? ""}` : ""}
                  />
                </dl>

                <MovesChart t={t} />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--l-line)] pt-3 text-xs text-[var(--l-muted)]">
                <span>
                  Implied move from the at-the-money straddle. Realized move is close to close
                  across the print.
                </span>
                <Link
                  href={`/t/${t.ticker}/`}
                  className="font-mono text-[11px] font-semibold text-[var(--l-accent)] transition-colors hover:text-[var(--l-text)]"
                >
                  Open {t.ticker} →
                </Link>
              </div>
            </div>

            {/* Right: the tape + the read */}
            <div className="flex flex-col justify-between bg-[var(--l-surface)]/60 p-5 sm:p-6 lg:col-span-4">
              <div>
                <div className="flex items-center justify-between border-b border-[var(--l-line)] pb-3">
                  <h3 className="font-mono text-xs font-bold tracking-wider text-[var(--l-text)] uppercase">
                    Last {n || 8} prints
                  </h3>
                  <span className="font-mono text-[11px] text-[var(--l-subtle)]">
                    vs today&rsquo;s {pctRange(t.implied)}
                  </span>
                </div>
                {n === 0 ? (
                  <p className="mt-4 text-sm text-[var(--l-muted)]">
                    No past prints on file for {t.ticker} yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5 font-mono text-xs">
                    {[...t.moves].reverse().map((m) => {
                      const beyond = Math.abs(m.move) > t.implied;
                      return (
                        <li
                          key={m.date}
                          className="flex items-center justify-between rounded-lg border border-[var(--l-line)] bg-[var(--l-panel)]/70 px-2.5 py-1.5"
                        >
                          <span className="text-[var(--l-muted)]">{formatDate(m.date)}</span>
                          <span className="flex items-center gap-2">
                            <span className="tnum font-semibold text-[var(--l-text)]">
                              {pctSigned(m.move)}
                            </span>
                            <span
                              className={`w-[3.75rem] rounded-[4px] px-1.5 py-0.5 text-center text-[9px] font-bold uppercase ${
                                beyond
                                  ? "bg-[var(--l-outside)]/15 text-[var(--l-outside)]"
                                  : "bg-[var(--l-accent-soft)]/10 text-[var(--l-accent-soft)]"
                              }`}
                            >
                              {beyond ? "Beyond" : "Inside"}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-[var(--l-line)] bg-[var(--l-card)] p-3.5">
                <p className="font-mono text-xs font-semibold text-[var(--l-accent)]">
                  The read
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--l-muted)]">
                  {readFor(t)}
                </p>
                <p className="mt-2 text-[11px] text-[var(--l-subtle)]">
                  Context, not a recommendation. The call is yours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--l-line)] bg-[var(--l-panel)]/70 p-3">
      <dt className="font-mono text-[10px] tracking-wider text-[var(--l-subtle)] uppercase">
        {label}
      </dt>
      <dd className="tnum mt-1 font-mono text-xl font-bold" style={{ color: tone }}>
        {value}
      </dd>
      <dd className="mt-0.5 font-mono text-[10px] leading-snug text-[var(--l-subtle)]">
        {hint}
      </dd>
    </div>
  );
}

/**
 * Each past print's move as a bar (magnitude), with today's implied move and
 * the stock's typical move as reference lines. A bar that crosses the cyan
 * line is a print the move priced today would not have covered.
 */
function MovesChart({ t }: { t: PreviewTicker }) {
  const W = 600;
  const H = 210;
  const PAD = { top: 24, right: 12, bottom: 28, left: 12 };
  const data = t.moves;

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--l-line)] bg-[var(--l-surface)]/90 p-6 text-sm text-[var(--l-muted)]">
        No past prints to compare yet. This fills in as {t.ticker} reports.
      </div>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max =
    Math.max(t.implied, t.typical ?? 0, ...data.map((d) => Math.abs(d.move))) * 1.18 || 0.01;
  const y = (v: number) => PAD.top + (1 - v / max) * plotH;
  const band = plotW / data.length;
  const barW = Math.min(34, band * 0.52);

  const yImplied = y(t.implied);
  const yTypical = t.typical ? y(t.typical) : null;

  return (
    <div className="rounded-xl border border-[var(--l-line)] bg-[var(--l-surface)]/90 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
        <span className="flex items-center gap-1.5 font-medium text-[var(--l-accent)]">
          <span className="h-0.5 w-3 rounded bg-[var(--l-accent)]" /> Priced today{" "}
          {pctRange(t.implied)}
        </span>
        {t.typical && (
          <span className="flex items-center gap-1.5 text-[var(--l-muted)]">
            <span className="h-0.5 w-3 rounded bg-[var(--l-line-strong)]" /> Typical{" "}
            {pctRange(t.typical)}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-[var(--l-muted)]">
          <span className="h-2 w-2 rounded-sm bg-[var(--l-outside)]" /> Moved more than priced
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-48 w-full sm:h-56"
        role="img"
        aria-label={`${t.ticker}: last ${data.length} earnings moves against today's implied move of ${pctRange(t.implied)}`}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + f * plotH}
            y2={PAD.top + f * plotH}
            stroke="var(--l-line)"
            strokeDasharray="3 3"
          />
        ))}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          stroke="var(--l-line-strong)"
        />

        {data.map((d, i) => {
          const mag = Math.abs(d.move);
          const beyond = mag > t.implied;
          const cx = PAD.left + band * i + band / 2;
          const top = y(mag);
          return (
            <g key={d.date}>
              <rect
                x={cx - barW / 2}
                y={top}
                width={barW}
                height={Math.max(1, PAD.top + plotH - top)}
                rx={3}
                fill={beyond ? "var(--l-outside)" : "var(--l-accent-soft)"}
                fillOpacity={beyond ? 0.9 : 0.4}
              >
                <title>{`${formatDate(d.date)}: ${pctSigned(d.move)}`}</title>
              </rect>
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                fontSize="10"
                className="text-[17px] sm:text-[10px]"
                fontFamily="var(--font-mono)"
                fill="var(--l-subtle)"
              >
                {shortQuarter(d.date)}
              </text>
            </g>
          );
        })}

        {yTypical !== null && (
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={yTypical}
            y2={yTypical}
            stroke="var(--l-line-strong)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={yImplied}
          y2={yImplied}
          stroke="var(--l-accent)"
          strokeWidth={2}
          strokeDasharray="6 4"
          style={{ filter: "drop-shadow(0 0 4px rgb(0 242 254 / 55%))" }}
        />

        {/* Value labels last, so the reference lines never strike through
            them; the dark stroke halo keeps them legible where they cross. */}
        {data.map((d, i) => {
          const mag = Math.abs(d.move);
          const beyond = mag > t.implied;
          return (
            <text
              key={d.date}
              x={PAD.left + band * i + band / 2}
              y={y(mag) - 6}
              textAnchor="middle"
              fontSize="11"
              className="text-[19px] sm:text-[11px]"
              fontFamily="var(--font-mono)"
              fill={beyond ? "var(--l-outside)" : "var(--l-muted)"}
              stroke="var(--l-surface)"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {pctSigned(d.move, 1)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/** "2025-11-19" -> "Nov '25". */
function shortQuarter(iso: string): string {
  const short = formatDateShort(iso).split(" ")[0];
  return `${short} '${iso.slice(2, 4)}`;
}
