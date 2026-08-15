"use client";

import { useEffect, useState } from "react";

/**
 * Fetches quarterly or annual income-statement figures from the Worker's
 * `/api/financials` route. Same same-origin-in-production,
 * 404s-under-plain-`next-dev` shape as useIntradayChart/useIndicators; see
 * useIntradayChart's docstring for why.
 */

export type FinancialsTimeframe = "quarterly" | "annual";

export interface FinancialsQuarter {
  fiscal_year: number;
  fiscal_period: string; // "Q1".."Q4" for quarterly, "FY" for annual
  period_end: string;
  filing_date: string | null;
  filing_url: string | null;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  diluted_eps: number | null;
}

interface FinancialsResponse {
  quarters: FinancialsQuarter[];
}

/** "Q3 FY26" for a quarter, "FY26" for an annual period — the FY-only form
 * matters because "FY FY26" would repeat itself the same way the tab labels
 * used to. */
export function periodLabel(q: FinancialsQuarter): string {
  const yy = String(q.fiscal_year).slice(-2);
  return q.fiscal_period === "FY" ? `FY${yy}` : `${q.fiscal_period} FY${yy}`;
}

export function useFinancials(ticker: string, timeframe: FinancialsTimeframe = "quarterly") {
  const [data, setData] = useState<FinancialsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Show the loading state as soon as the ticker or timeframe changes,
  // without a synchronous setState inside the effect below — React's
  // documented pattern for resetting state on a prop change is to do it
  // during render, the same idiom useIntradayChart/useIndicators use.
  const [prevKey, setPrevKey] = useState(`${ticker}:${timeframe}`);
  const key = `${ticker}:${timeframe}`;
  if (prevKey !== key) {
    setPrevKey(key);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;

    // The Worker's own edge cache (24h) is where the real cost-control
    // happens; skipping the browser's HTTP cache here just means each page
    // load asks that already-fast cache fresh, rather than risking this tab
    // showing day-old figures right after a company files.
    fetch(`/api/financials?ticker=${ticker}&timeframe=${timeframe}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<FinancialsResponse>) : null))
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, timeframe]);

  return { data, loading };
}
