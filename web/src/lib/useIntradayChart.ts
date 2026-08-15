"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetches intraday price series from the Worker's `/api/chart` route.
 *
 * Same-origin in production, since the static site and the API share a
 * Worker — no CORS config needed. In local `next dev` (no Worker attached)
 * this 404s, which the hook surfaces as `error` rather than throwing; the
 * chart falls back to the 1Y static series rather than breaking the page.
 */

export interface IntradayPoint {
  t: string; // ISO timestamp
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

interface ChartResponse {
  points: IntradayPoint[];
  regular_market_price: number | null;
  previous_close: number | null;
}

const POLL_MS = 30_000;

export function useIntradayChart(
  ticker: string,
  range: "1d" | "5d",
  { live = false }: { live?: boolean } = {},
) {
  const [data, setData] = useState<ChartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chart?ticker=${ticker}&range=${range}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const body = (await res.json()) as ChartResponse;
      setData(body);
      setError(null);
    } catch {
      setError("Live chart isn't available right now.");
    } finally {
      setLoading(false);
    }
  }, [ticker, range]);

  // Show the loading state as soon as the ticker/range changes, without a
  // synchronous setState inside the effect below — React's documented
  // pattern for resetting state on a prop change is to do it during render.
  const key = `${ticker}:${range}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setLoading(true);
  }

  useEffect(() => {
    // react-hooks/set-state-in-effect traces into `load` (useCallback-wrapped,
    // async) and flags this call because the function eventually calls
    // setState — even though every setState inside it happens after an
    // `await`, i.e. asynchronously, which is the standard documented
    // fetch-in-effect pattern (https://react.dev/reference/react/useEffect#fetching-data-with-effects).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();

    // Only 1D polls — 5D bars are 15 minutes apart, so refetching every 30s
    // would just hammer the endpoint for a chart that hasn't visibly changed.
    if (live && range === "1d") {
      timer.current = setInterval(load, POLL_MS);
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load, live, range]);

  return { data, error, loading };
}
