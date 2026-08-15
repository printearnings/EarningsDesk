"use client";

import { FinancialsChart } from "@/components/FinancialsChart";
import { Panel } from "@/components/Panel";
import { useFinancials } from "@/lib/useFinancials";
import { EMPTY, eps, moneyCompact, pct } from "@/lib/format";

/** margin = numerator / revenue — null whenever revenue is missing or zero,
 * since a margin without a real denominator isn't a percentage of anything. */
function margin(numerator: number | null, revenue: number | null): number | null {
  if (numerator === null || !revenue) return null;
  return numerator / revenue;
}

/**
 * Quarterly income-statement history — the fundamentals context an earnings
 * call sits on top of. The options panel says what the market is pricing for
 * the print; this says what the last two years of prints actually did to the
 * business, which is the other half of "is that a reasonable price."
 *
 * Client-fetched (like the price chart's intraday/indicator data) rather than
 * baked into the nightly snapshot — a company only refiles a handful of times
 * a year, so there's no freshness reason to pay for this at snapshot time for
 * every tracked ticker when a 24h edge cache already keeps the metered-call
 * cost negligible.
 */
export function FinancialsPanel({ ticker }: { ticker: string }) {
  const { data, loading } = useFinancials(ticker);

  return (
    <Panel
      title="Quarterly financials"
      subtitle="Revenue, margins, and earnings from the last eight reports"
      bodyClassName="px-0 py-0"
      empty={
        // Not necessarily a data gap on our end — SEC XBRL quarterly figures
        // only exist for domestic filers. A foreign private issuer (most
        // ADRs) files an annual 20-F instead of quarterly 10-Qs, so there is
        // no quarterly filing for this endpoint to have ever found.
        !loading && (!data || data.quarters.length === 0)
          ? "No quarterly SEC filings found for this symbol — common for foreign-domiciled companies, which file an annual 20-F instead of a 10-Q each quarter."
          : undefined
      }
    >
      {loading ? (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        data &&
        data.quarters.length > 0 && (
          <div>
            <div className="border-b border-[var(--color-border)] px-5 py-5">
              <FinancialsChart quarters={data.quarters} />
            </div>
            <div className="overflow-x-auto">
              <table className="tnum w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] text-left">
                    {[
                      "Quarter",
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
                  {data.quarters.map((q) => {
                    const maxRevenue = Math.max(...data.quarters.map((r) => r.revenue ?? 0), 1);
                    const barWidth = q.revenue
                      ? Math.max(4, (q.revenue / maxRevenue) * 100)
                      : 0;
                    return (
                      <tr
                        key={q.period_end}
                        className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                          Q{q.fiscal_quarter} FY{String(q.fiscal_year).slice(-2)}
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
          </div>
        )
      )}
    </Panel>
  );
}
