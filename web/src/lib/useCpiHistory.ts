"use client";

import { useEffect, useState } from "react";

/**
 * Fetches headline/core CPI, month-over-month and year-over-year, from the
 * Worker's `/api/macro/cpi` route (which itself computes these live from
 * FRED's own CPIAUCSL/CPILFESL series — see handleCpiHistory in the Worker).
 * Same same-origin/client-fetched shape as useFinancials: this data changes
 * once a month, so there's no reason to bake it into the nightly snapshot.
 */

export interface CpiMonth {
  month: string; // "YYYY-MM"
  index: number;
  core_index: number | null;
  mom_pct: number | null;
  yoy_pct: number | null;
  core_mom_pct: number | null;
  core_yoy_pct: number | null;
}

interface CpiHistoryResponse {
  months: CpiMonth[];
  source: string;
}

export function useCpiHistory() {
  const [data, setData] = useState<CpiHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/macro/cpi", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<CpiHistoryResponse>) : null))
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
  }, []);

  return { data, loading };
}
