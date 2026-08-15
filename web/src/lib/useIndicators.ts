"use client";

import { useEffect, useState } from "react";

/**
 * Fetches the 20-day SMA and 50-day EMA from the Worker's `/api/indicators`
 * route — daily-only, so this is meant for the 1Y chart, never 1D/5D. Same
 * same-origin-in-production, 404s-under-plain-`next-dev` shape as
 * useIntradayChart; see that file's docstring for why.
 */

export interface IndicatorPoint {
  date: string;
  value: number;
}

interface IndicatorsResponse {
  sma20: IndicatorPoint[];
  ema50: IndicatorPoint[];
}

export function useIndicators(ticker: string, enabled: boolean) {
  const [data, setData] = useState<IndicatorsResponse | null>(null);

  // Clear stale data as soon as the ticker changes or the chart leaves the
  // 1Y view, without a synchronous setState inside the effect below — done
  // during render, the same pattern useIntradayChart uses.
  const key = enabled ? ticker : "";
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setData(null);
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    fetch(`/api/indicators?ticker=${ticker}`)
      .then((res) => (res.ok ? (res.json() as Promise<IndicatorsResponse>) : null))
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, enabled]);

  return data;
}
