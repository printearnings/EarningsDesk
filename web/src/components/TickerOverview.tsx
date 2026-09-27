import type { ReactNode } from "react";

import { VerdictChip } from "@/components/Chip";
import type { TickerPage as TickerData } from "@/lib/api";
import {
  EMPTY,
  compact,
  eps,
  formatDate,
  formatDateShort,
  money,
  num,
  pctRange,
  pctSigned,
  relativeDays,
  sessionLabel,
} from "@/lib/format";

/**
 * The ticker Overview's "terminal" pieces: a four-card KPI row, and the
 * last-eight-prints panel that sits beside the price chart.
 *
 * Everything reads from design tokens, so it renders in both themes. Mono
 * type carries the figures and labels, the way a quote screen does.
 *
 * Every figure is on the page payload. Nothing here is inferred or scored
 * on the fly, and the copy describes what options price and what the
 * stock did, never what to do about it.
 */

const LABEL =
  "font-mono text-[10px] font-medium tracking-[0.08em] text-[var(--color-muted)] uppercase";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--radius-panel)] border border-[var(--color-panel-edge)] ${className}`}
      style={{ background: "var(--gradient-tile)", boxShadow: "var(--shadow-card)" }}
    >
      {children}
    </div>
  );
}

function Badge({
  children,
  tone = "brand",
}: {
  children: ReactNode;
  tone?: "brand" | "muted";
}) {
  const cls =
    tone === "brand"
      ? "border-[var(--color-brand)]/40 bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
      : "border-[var(--color-border)] text-[var(--color-muted)]";
  return (
    <span
      className={`rounded-[4px] border px-1.5 py-0.5 font-mono text-[10px] leading-none font-medium whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  );
}

function KpiCard({
  label,
  badge,
  value,
  valueClass = "text-[var(--color-heading)]",
  sub,
  footLabel,
  footValue,
  hint,
}: {
  label: string;
  badge?: ReactNode;
  value: string;
  valueClass?: string;
  sub?: ReactNode;
  footLabel?: string;
  footValue?: string;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col px-4 py-3.5">
      <div className="flex items-start justify-between gap-2" title={hint}>
        <span className={LABEL}>{label}</span>
        {badge}
      </div>
      <p className={`tnum mt-2 font-mono text-2xl font-semibold tracking-tight ${valueClass}`}>
        {value || "No data"}
      </p>
      {sub && <div className="mt-1 text-sm text-[var(--color-muted)]">{sub}</div>}
      {footLabel && (
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--color-border-subtle)] pt-2.5 font-mono text-[11px]">
          <span className="text-[var(--color-muted)]">{footLabel}</span>
          <span className="tnum font-semibold text-[var(--color-heading)]">
            {footValue || "No data"}
          </span>
        </div>
      )}
    </Card>
  );
}

function verdictClass(verdict: string | null | undefined): string {
  if (verdict === "RICH") return "text-[var(--color-verdict-rich)]";
  if (verdict === "CHEAP") return "text-[var(--color-verdict-cheap)]";
  return "text-[var(--color-heading)]";
}

/** "2026-09-28" -> "Monday", parsed calendar-local like format.ts does. */
function weekday(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return EMPTY;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long" });
}

/** "2025-11-19" -> "Nov '25". */
export function shortQuarter(iso: string): string {
  return `${formatDateShort(iso).split(" ")[0]} '${iso.slice(2, 4)}`;
}

function pastMoves(data: TickerData): { date: string; move: number }[] {
  return (data.past_moves ?? [])
    .filter((m) => typeof m.move === "number")
    .map((m) => ({ date: m.report_date, move: m.move as number }))
    .sort((a, b) => b.date.localeCompare(a.date)) // newest first
    .slice(0, 8);
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Priced move as a multiple of the stock's typical move, e.g. 2.0. */
export function pricedMultiple(data: TickerData): number | null {
  const o = data.options;
  return o && typeof o.implied_move === "number" && o.hist_avg_move
    ? o.implied_move / o.hist_avg_move
    : null;
}

export function KpiCards({ data }: { data: TickerData }) {
  const o = data.options;
  const implied = o?.implied_move ?? null;
  const spot = data.spot ?? null;
  const multiple = pricedMultiple(data);
  const moves = pastMoves(data);
  const largest = moves.length
    ? moves.reduce((a, b) => (Math.abs(b.move) > Math.abs(a.move) ? b : a))
    : null;
  const upcoming = data.history.find((h) => h.report_date === data.next_report_date);
  const session = sessionLabel(data.next_report_session);
  const pcr = o?.put_call_ratio ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="Next report"
        badge={
          data.next_report_date && typeof data.days_until_report === "number" ? (
            <Badge>{relativeDays(data.days_until_report)}</Badge>
          ) : undefined
        }
        value={data.next_report_date ? formatDate(data.next_report_date) : "Not scheduled"}
        sub={
          data.next_report_date
            ? [session, weekday(data.next_report_date)].filter(Boolean).join(" · ")
            : "No confirmed earnings date"
        }
        footLabel="Consensus EPS"
        footValue={
          upcoming?.eps_estimate != null ? `${eps(upcoming.eps_estimate)} est.` : EMPTY
        }
        hint="The next scheduled earnings date."
      />
      <KpiCard
        label="Implied move"
        badge={<VerdictChip verdict={o?.verdict} />}
        value={pctRange(implied)}
        valueClass={verdictClass(o?.verdict)}
        sub={
          implied !== null && spot !== null
            ? `Range ${money(spot * (1 - implied))} – ${money(spot * (1 + implied))}`
            : "No options pricing yet"
        }
        footLabel="ATM straddle"
        footValue={
          o?.atm_strike && o?.atm_expiry
            ? `${money(o.atm_strike, 0)} · exp ${formatDateShort(o.atm_expiry)}`
            : EMPTY
        }
        hint="What the at-the-money straddle prices for this earnings date."
      />
      <KpiCard
        label="Typical move"
        badge={
          multiple !== null ? (
            <Badge tone="muted">Priced {multiple.toFixed(1)}×</Badge>
          ) : undefined
        }
        value={pctRange(o?.hist_avg_move)}
        sub={moves.length ? `Average of last ${moves.length} prints` : "Not enough past prints"}
        footLabel="Largest move"
        footValue={
          largest ? `${pctSigned(largest.move)} (${shortQuarter(largest.date)})` : EMPTY
        }
        hint="Average absolute move after the last eight earnings reports."
      />
      <KpiCard
        label="Put/call ratio"
        value={num(pcr)}
        sub={
          pcr === null
            ? "No volume yet today"
            : pcr > 1
              ? "More put volume than call today"
              : "More call volume than put today"
        }
        footLabel="ATM open interest"
        footValue={compact(o?.atm_open_interest)}
        hint="Put volume divided by call volume, all strikes and expiries."
      />
    </div>
  );
}

/**
 * Each of the last eight prints against the move being priced now: the
 * signed move, a magnitude bar, and whether today's implied move would
 * have covered it.
 */
export function RecentPrints({ data }: { data: TickerData }) {
  const moves = pastMoves(data);
  const implied = data.options?.implied_move ?? null;
  const historyImplied = new Map(
    data.history
      .filter((h) => typeof h.implied_move === "number")
      .map((h) => [h.report_date, h.implied_move as number]),
  );
  const mags = moves.map((m) => Math.abs(m.move));
  const max = Math.max(...mags, implied ?? 0) || 1;
  const beyond = implied !== null ? mags.filter((m) => m > implied).length : null;
  const med = median(mags);
  const multiple = pricedMultiple(data);

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-subtle)] px-4 py-3">
        <h2 className="rounded-[var(--radius-sm)] border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/10 px-2.5 py-1 font-mono text-xs font-semibold text-[var(--color-brand)]">
          Last {moves.length || 8} prints
        </h2>
        {implied !== null && <Badge tone="muted">vs today&rsquo;s {pctRange(implied)}</Badge>}
      </div>

      {moves.length === 0 ? (
        <p className="px-4 py-8 text-sm text-[var(--color-muted)]">
          No past prints on file yet. This fills in as {data.ticker} reports.
        </p>
      ) : (
        <div className="flex flex-1 flex-col px-4 py-4">
          <dl className="grid grid-cols-3 gap-2">
            {[
              { label: "Median move", value: med !== null ? pctRange(med) : EMPTY },
              {
                label: "Moved more",
                value: beyond !== null ? `${beyond} of ${moves.length}` : EMPTY,
              },
              { label: "Largest", value: pctRange(Math.max(...mags)) },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-2 text-center"
              >
                <dt className={LABEL}>{s.label}</dt>
                <dd className="tnum mt-1 font-mono text-sm font-semibold text-[var(--color-brand)]">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>

          <ul className="mt-3 space-y-1.5">
            {moves.map((m) => {
              const mag = Math.abs(m.move);
              const out = implied !== null && mag > implied;
              const then = historyImplied.get(m.date);
              const up = m.move >= 0;
              return (
                <li
                  key={m.date}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-xs">
                    <span className="w-14 font-semibold text-[var(--color-heading)]">
                      {shortQuarter(m.date)}
                    </span>
                    <span
                      className={`tnum w-14 font-semibold ${up ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}
                    >
                      {pctSigned(m.move)}
                    </span>
                    <span className="tnum flex-1 text-right text-[11px] text-[var(--color-muted)]">
                      {then !== undefined ? `Imp ${pctRange(then)}` : ""}
                    </span>
                    {implied !== null && (
                      <span
                        className={`w-14 rounded-[4px] border px-1 py-0.5 text-center text-[10px] font-medium ${
                          out
                            ? "border-[var(--color-viz-realized)]/40 text-[var(--color-viz-realized)]"
                            : "border-[var(--color-border)] text-[var(--color-muted)]"
                        }`}
                      >
                        {out ? "Beyond" : "Inside"}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--color-panel-soft)]">
                    <div
                      className={`h-full rounded-full ${up ? "bg-[var(--color-positive)]" : "bg-[var(--color-negative)]"}`}
                      style={{ width: `${Math.max(3, (mag / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          {implied !== null && beyond !== null && (
            <p className="mt-auto flex gap-2 border-t border-[var(--color-border-subtle)] pt-3 font-mono text-[11px] leading-relaxed text-[var(--color-body)]">
              <span className="text-[var(--color-brand)]" aria-hidden>
                ↗
              </span>
              <span>
                Moved more than today&rsquo;s {pctRange(implied)} in{" "}
                <strong className="font-semibold text-[var(--color-heading)]">
                  {beyond} of the last {moves.length}
                </strong>{" "}
                prints.
                {multiple !== null &&
                  ` Options are pricing ${multiple.toFixed(1)}× its typical move.`}
              </span>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
