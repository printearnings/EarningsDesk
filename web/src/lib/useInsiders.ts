"use client";

import { useEffect, useState } from "react";

/**
 * Fetches SEC Form 4 insider transactions from the Worker's `/api/insiders`
 * route. Auto-fetches on mount rather than waiting for a click, same as
 * useFinancials — the Worker's own edge cache (6h) is what actually controls
 * the metered-call cost, not a manual gate on this side.
 */

export interface InsiderTransaction {
  filing_date: string | null;
  transaction_date: string | null;
  owner_name: string | null;
  officer_title: string | null;
  is_director: boolean;
  is_officer: boolean;
  is_ten_percent_owner: boolean;
  transaction_code: string | null;
  acquired_or_disposed: "A" | "D" | null;
  shares: number | null;
  price_per_share: number | null;
  value: number | null;
  shares_owned_after: number | null;
  filing_url: string | null;
}

interface InsidersResponse {
  transactions: InsiderTransaction[];
}

export function useInsiders(ticker: string) {
  const [data, setData] = useState<InsidersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [prevTicker, setPrevTicker] = useState(ticker);
  if (prevTicker !== ticker) {
    setPrevTicker(ticker);
    setLoading(true);
  }

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/insiders?ticker=${ticker}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<InsidersResponse>) : null))
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
