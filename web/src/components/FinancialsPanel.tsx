"use client";

import { useMemo, useState } from "react";

import { FinancialsChart } from "@/components/FinancialsChart";
import { toggleInSet } from "@/components/FilterGroup";
import { Pagination } from "@/components/Pagination";
import { Panel } from "@/components/Panel";
import {
  type FinancialsQuarter,
  type FinancialsTimeframe,
  periodLabel,
  useFinancials,
} from "@/lib/useFinancials";
import { EMPTY, eps, moneyCompact, pct } from "@/lib/format";

/** margin = numerator / revenue — null whenever revenue is missing or zero,
 * since a margin without a real denominator isn't a percentage of anything. */
function margin(numerator: number | null, revenue: number | null): number | null {
  if (numerator === null || !revenue) return null;
  return numerator / revenue;
}

const TIMEFRAMES: { key: FinancialsTimeframe; label: string }[] = [
  { key: "quarterly", label: "Quarterly" },
  { key: "annual", label: "Annual" },
];

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
const PAGE_SIZE = 8;

/**
 * Quarterly or annual income-statement history — the fundamentals context an
 * earnings call sits on top of. The options panel says what the market is
 * pricing for the print; this says what the business's actual results have
 * done, which is the other half of "is that a reasonable price."
 *
 * Client-fetched (like the price chart's intraday/indicator data) rather than
 * baked into the nightly snapshot — a company only refiles a handful of times
 * a year, so there's no freshness reason to pay for this at snapshot time for
 * every tracked ticker when a 24h edge cache already keeps the metered-call
 * cost negligible.
 */
export function FinancialsPanel({ ticker }: { ticker: string }) {
  const [timeframe, setTimeframe] = useState<FinancialsTimeframe>("quarterly");
  const { data, loading } = useFinancials(ticker, timeframe);
  const [quarters, setQuarters] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const filtersActive = timeframe === "quarterly" && quarters.size > 0;

  // Reset to page 1 whenever the filtered set could change shape — done
  // during render (this app's usual reset-on-prop-change idiom) so a filter
  // or timeframe flip never leaves you stranded on a page the new result
  // set doesn't have.
  const resetKey = `${timeframe}|${[...quarters].join(",")}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setPage(1);
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!filtersActive) return data.quarters;
    return data.quarters.filter((q) => quarters.has(q.fiscal_period));
  }, [data, quarters, filtersActive]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const maxRevenue = useMemo(
    () => Math.max(...filtered.map((r) => r.revenue ?? 0), 1),
    [filtered],
  );

  return (
    <Panel
      subtitle={
        timeframe === "annual"
          ? "Revenue, margins, and earnings by fiscal year"
          : "Revenue, margins, and earnings by quarter"
      }
      bodyClassName="px-0 py-0"
      action={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {timeframe === "quarterly" && (
            <div className="flex items-center gap-1.5">
              <span className="eyebrow text-[var(--color-muted)]">Quarter</span>
              <div className="flex items-center gap-1">
                {QUARTERS.map((q) => {
                  const isActive = quarters.has(q);
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() => toggleInSet(quarters, setQuarters, q)}
                      aria-pressed={isActive}
                      className={`pressable text-2xs rounded-[var(--radius-chip)] border px-1.5 py-0.5 font-mono font-medium tracking-[0.06em] uppercase transition-colors ${
                        isActive
                          ? "border-[var(--color-heading)]/20 bg-[var(--color-panel-soft)] text-[var(--color-heading)]"
                          : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)]"
                      }`}
                    >
                      {q}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5">
            {TIMEFRAMES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTimeframe(t.key)}
                aria-pressed={timeframe === t.key}
                className={`pressable rounded-[3px] px-2.5 py-1 text-sm font-medium transition-colors ${
                  timeframe === t.key
                    ? "bg-[var(--color-panel-soft)] text-[var(--color-heading)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      }
      empty={
        // Not necessarily a data gap on our end — SEC XBRL figures only
        // exist for domestic filers. A foreign private issuer (most ADRs)
        // files an annual 20-F instead of quarterly/annual 10-Q/10-K
        // filings, so there is no filing for this endpoint to have found.
        !loading && (!data || data.quarters.length === 0)
          ? "No SEC filings found for this symbol. Common for foreign-domiciled companies, which file an annual 20-F instead of a 10-Q."
          : filtersActive && filtered.length === 0
            ? "No quarters match this filter."
            : undefined
      }
    >
      {loading ? (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        data &&
        filtered.length > 0 && (
          <div>
            <div className="border-b border-[var(--color-border)] px-5 py-5">
              <FinancialsChart quarters={filtered} />
            </div>
            <div className="overflow-x-auto">
              <table className="tnum w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] text-left">
                    {[
                      "Period",
                      "Revenue",
                      "Gross margin",
                      "Op margin",
                      "Net income",
                      "Diluted EPS",
                      "",
                    ].map((h) => (
                      <th key={h} className="eyebrow px-3 py-2.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((q: FinancialsQuarter) => {
                    const barWidth = q.revenue
                      ? Math.max(4, (q.revenue / maxRevenue) * 100)
                      : 0;
                    return (
                      <tr
                        key={q.period_end}
                        className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                          {periodLabel(q)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-16 shrink-0 font-medium text-[var(--color-heading)]">
                              {moneyCompact(q.revenue)}
                            </span>
                            {q.revenue !== null && (
                              <span
                                className="h-1.5 rounded-[2px]"
                                style={{
                                  width: `${barWidth}%`,
                                  maxWidth: "4rem",
                                  background: "var(--color-viz-price)",
                                  opacity: 0.35,
                                }}
                                aria-hidden
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {pct(margin(q.gross_profit, q.revenue), 0)}
                        </td>
                        <td className="px-3 py-2.5">
                          {pct(margin(q.operating_income, q.revenue), 0)}
                        </td>
                        <td className="px-3 py-2.5">{moneyCompact(q.net_income)}</td>
                        <td className="px-3 py-2.5">
                          {q.diluted_eps === null ? EMPTY : eps(q.diluted_eps)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {q.filing_url && (
                            // Third-party link: no `noopener` would let sec.gov
                            // reach back via `window.opener` into this tab.
                            <a
                              href={q.filing_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--color-body)] underline-offset-4 hover:text-[var(--color-heading)] hover:underline"
                            >
                              Filing ↗
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
            />
          </div>
        )
      )}
    </Panel>
  );
}
