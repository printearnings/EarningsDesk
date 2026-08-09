"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Panel } from "@/components/Panel";
import { money } from "@/lib/format";

interface LookupResult {
  ticker: string;
  found: boolean;
  spot: number | null;
  previous_close: number | null;
  company_name: string | null;
  next_report_date: string | null;
}

export function LookupClient({ trackedTickers }: { trackedTickers: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const ticker = (params.get("ticker") ?? "").trim().toUpperCase();

  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear stale data as soon as the ticker changes, without a synchronous
  // setState inside the effect below — done during render, React's documented
  // pattern for resetting state on a prop change (see useIntradayChart for
  // the same shape).
  const [prevTicker, setPrevTicker] = useState(ticker);
  if (prevTicker !== ticker) {
    setPrevTicker(ticker);
    setResult(null);
    setError(null);
  }

  useEffect(() => {
    if (!ticker) return;

    // Already a tracked ticker — send them to the real page instead, which
    // has options data, history, and news the cold path can't offer.
    if (trackedTickers.includes(ticker)) {
      router.replace(`/t/${ticker}/`);
      return;
    }

    let cancelled = false;

    fetch(`/api/lookup?ticker=${ticker}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<LookupResult>;
      })
      .then((body) => {
        if (!cancelled) setResult(body);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't look that up right now.");
      });

    return () => {
      cancelled = true;
    };
  }, [ticker, trackedTickers, router]);

  if (!ticker) {
    return (
      <div className="px-6 py-6">
        <Panel title="Look up a ticker" empty="Search for a symbol above." />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-6 py-6">
      <div>
        <h1 className="display text-3xl">{ticker}</h1>
        <p className="mt-1 text-sm text-[var(--color-warning)]">
          Outside the tracked universe — free live data only, no options pricing or
          earnings history.
        </p>
      </div>

      {error && (
        <p className="rounded-[var(--radius-sm)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning)]">
          {error}
        </p>
      )}

      {!error && !result && (
        <p className="text-sm text-[var(--color-muted)]">Looking up {ticker}…</p>
      )}

      {result && !result.found && (
        <Panel
          title="No data"
          empty={`Couldn't find a symbol matching "${ticker}". Check the spelling, or it may not be a listed US equity.`}
        />
      )}

      {result?.found && (
        <Panel title={result.company_name ?? ticker}>
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <div>
              <dt className="eyebrow">Price</dt>
              <dd className="tnum mt-1.5 text-2xl font-semibold text-[var(--color-heading)]">
                {money(result.spot)}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Previous close</dt>
              <dd className="tnum mt-1.5 text-2xl font-semibold text-[var(--color-heading)]">
                {money(result.previous_close)}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Next earnings</dt>
              <dd className="mt-1.5 text-2xl font-semibold text-[var(--color-heading)]">
                {result.next_report_date ?? "Unknown"}
              </dd>
            </div>
          </dl>
        </Panel>
      )}
    </div>
  );
}
