"use client";

import { useEffect, useState } from "react";

/**
 * Fetches SMA 20 / EMA 50 / RSI 14 / MACD(12,26,9) from the Worker's
 * `/api/indicators` route, in whatever bar granularity the given range's
 * chart itself uses (1m/5m/daily) — an overlay computed on a different
 * timespan than what's on screen wouldn't line up with it. Same
 * same-origin-in-production, 404s-under-plain-`next-dev` shape as
 * useIntradayChart; see that file's docstring for why.
 *
 * All four are always fetched together — the chart decides which to render
 * (default: none, all opt-in via its settings menu), so there's one request
 * to reason about rather than four independently-toggled ones.
 */

export interface IndicatorPoint {
  date: string;
  value: number;
}

export interface MACDPoint {
  date: string;
  macd: number;
  signal: number;
  histogram: number;
}

interface IndicatorsResponse {
  sma20: IndicatorPoint[];
  ema50: IndicatorPoint[];
  rsi14: IndicatorPoint[];
  macd: MACDPoint[];
}

export function useIndicators(ticker: string, range: "1d" | "5d" | "1y") {
  const [data, setData] = useState<IndicatorsResponse | null>(null);

  // Clear stale data as soon as the ticker or range changes, without a
  // synchronous setState inside the effect below — done during render, the
  // same pattern useIntradayChart uses.
  const key = `${ticker}:${range}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setData(null);
  }

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/indicators?ticker=${ticker}&range=${range}`)
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
  }, [ticker, range]);

  return data;
}
