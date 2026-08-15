"use client";

import { useEffect, useState } from "react";

/**
 * Fetches the last two years of quarterly income-statement figures from the
 * Worker's `/api/financials` route. Same same-origin-in-production,
 * 404s-under-plain-`next-dev` shape as useIntradayChart/useIndicators; see
 * useIntradayChart's docstring for why.
 */

export interface FinancialsQuarter {
  fiscal_year: number;
  fiscal_quarter: number;
  period_end: string;
  revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  diluted_eps: number | null;
}

interface FinancialsResponse {
  quarters: FinancialsQuarter[];
}

export function useFinancials(ticker: string) {
  const [data, setData] = useState<FinancialsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Show the loading state as soon as the ticker changes, without a
  // synchronous setState inside the effect below — React's documented
  // pattern for resetting state on a prop change is to do it during render,
  // the same idiom useIntradayChart/useIndicators use.
  const [prevTicker, setPrevTicker] = useState(ticker);
  if (prevTicker !== ticker) {
    setPrevTicker(ticker);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;

    // The Worker's own edge cache (24h) is where the real cost-control
    // happens; skipping the browser's HTTP cache here just means each page
    // load asks that already-fast cache fresh, rather than risking this tab
    // showing day-old figures right after a company files.
    fetch(`/api/financials?ticker=${ticker}`, { cache: "no-store" })
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
  }, [ticker]);

  return { data, loading };
}
