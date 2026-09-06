"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CompanyLogo } from "@/components/CompanyLogo";
import { NewsThumbnail } from "@/components/NewsThumbnail";
import { Eyebrow, Panel, Stat, StatCard } from "@/components/Panel";
import { PriceChart } from "@/components/PriceChart";
import {
  EMPTY,
  eps,
  formatDate,
  formatDateShort,
  money,
  num,
  pctRange,
  pctRaw,
} from "@/lib/format";

interface LookupPricePoint {
  date: string;
  close: number;
}

interface LookupEarningsRow {
  quarter_end: string;
  eps_estimate: number | null;
  eps_actual: number | null;
  eps_surprise_pct: number | null;
}

interface LookupNewsItem {
  title: string;
  url: string | null;
  publisher: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
}

interface LookupResult {
  ticker: string;
  found: boolean;
  spot: number | null;
  previous_close: number | null;
  company_name: string | null;
  next_report_date: string | null;
  prices: LookupPricePoint[];
  earnings_history: LookupEarningsRow[];
  news: LookupNewsItem[];
}

interface RefreshResult {
  ticker: string;
  as_of: string;
  spot: number | null;
  implied_move: number | null;
  atm_strike: number | null;
  atm_expiry: string | null;
  straddle_price: number | null;
  put_call_ratio: number | null;
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
    // has options data, scored history, and an AI read the cold path can't
    // offer.
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
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {result?.company_name && (
            <div className="mb-1 flex items-center gap-1.5">
              <CompanyLogo ticker={ticker} domain={null} size={16} />
              <span className="text-sm text-[var(--color-muted)]">{result.company_name}</span>
            </div>
          )}
          <h1 className="display text-3xl">{ticker}</h1>
        </div>
        <div className="text-right">
          <Eyebrow>Not pre-computed</Eyebrow>
          <p className="mt-1 max-w-xs text-sm text-[var(--color-body)]">
            Price and news are live, fetched just now. This ticker is not in the nightly
            universe: no options history, no scored track record. Price options on demand below.
          </p>
        </div>
      </header>

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
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Price" value={money(result.spot)} />
            <StatCard label="Previous close" value={money(result.previous_close)} />
            <StatCard
              label="Next earnings"
              value={result.next_report_date ? formatDateShort(result.next_report_date) : EMPTY}
              hint={result.next_report_date ? formatDate(result.next_report_date) : undefined}
            />
          </div>

          <RefreshPanel ticker={ticker} nextReportDate={result.next_report_date} />

          {result.prices.length > 1 && (
            <Panel title="Price">
              <PriceChart prices={result.prices} events={[]} ticker={ticker} />
            </Panel>
          )}

          {result.earnings_history.length > 0 && (
            <Panel title="Earnings history" bodyClassName="px-0 py-0">
              <div className="overflow-x-auto">
                <table className="tnum w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-table-head)] text-left">
                      {["Quarter ended", "EPS est", "EPS actual", "Surprise"].map((h) => (
                        <th key={h} className="eyebrow px-4 py-2.5 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.earnings_history.map((row) => (
                      <tr
                        key={row.quarter_end}
                        className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                          {formatDateShort(row.quarter_end)}
                        </td>
                        <td className="px-4 py-2.5">{eps(row.eps_estimate)}</td>
                        <td className="px-4 py-2.5">{eps(row.eps_actual)}</td>
                        <td
                          className={`px-4 py-2.5 ${
                            typeof row.eps_surprise_pct === "number"
                              ? row.eps_surprise_pct >= 0
                                ? "text-[var(--color-positive)]"
                                : "text-[var(--color-negative)]"
                              : ""
                          }`}
                        >
                          {pctRaw(
                            typeof row.eps_surprise_pct === "number"
                              ? row.eps_surprise_pct * 100
                              : null,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Panel
            title="Recent news"
            empty={result.news.length === 0 ? "No recent headlines." : undefined}
          >
            {result.news.length > 0 && (
              <ul className="space-y-3">
                {result.news.map((item) => (
                  <li
                    key={item.url ?? item.title}
                    className="flex gap-3 border-b border-[var(--color-border-subtle)] pb-3 last:border-b-0 last:pb-0"
                  >
                    {item.thumbnail_url && <NewsThumbnail src={item.thumbnail_url} alt="" />}
                    <div className="min-w-0">
                      {item.url ? (
                        // Third-party link: no `noopener` would let the destination
                        // page reach back via `window.opener` into this tab.
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[var(--color-body)] underline-offset-4 hover:text-[var(--color-heading)] hover:underline"
                        >
                          {item.title}
                        </a>
                      ) : (
                        <span className="text-sm text-[var(--color-body)]">{item.title}</span>
                      )}
                      {item.publisher && (
                        <span className="text-2xs mt-0.5 block text-[var(--color-muted)]">
                          {item.publisher}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/**
 * The one metered action on this page: an on-demand ATM straddle price from
 * Massive, via the Worker's rate-limited /api/refresh. Everything else here
 * is free; this costs the site's own quota, so it's a deliberate click, not
 * something that fires on page load.
 */
function RefreshPanel({
  ticker,
  nextReportDate,
}: {
  ticker: string;
  nextReportDate: string | null;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; data: RefreshResult }
    | { status: "error"; message: string }
  >({ status: "idle" });

  if (!nextReportDate) {
    return (
      <Panel
        title="Options pricing"
        empty="No confirmed earnings date. Nothing to price yet."
      />
    );
  }

  async function refresh() {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/refresh?ticker=${ticker}&report_date=${nextReportDate}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ status: "error", message: body.error ?? `Request failed (${res.status}).` });
        return;
      }
      setState({ status: "done", data: body as RefreshResult });
    } catch {
      setState({ status: "error", message: "Couldn't reach the options data provider." });
    }
  }

  return (
    <Panel
      title="Options pricing"
      subtitle="Not pre-computed for this ticker. Price the at-the-money straddle now."
      action={
        <button
          type="button"
          onClick={refresh}
          disabled={state.status === "loading"}
          className="pressable rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-sm font-medium text-[var(--color-heading)] transition-colors hover:bg-[var(--color-panel-soft)] disabled:opacity-50"
        >
          {state.status === "loading" ? "Pricing…" : "Price this now"}
        </button>
      }
    >
      {state.status === "error" && (
        <p className="text-sm text-[var(--color-warning)]">{state.message}</p>
      )}
      {state.status === "done" && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Stat label="Implied move" value={pctRange(state.data.implied_move)} />
          <Stat label="Straddle price" value={money(state.data.straddle_price)} />
          <Stat label="Put/call ratio" value={num(state.data.put_call_ratio)} />
        </dl>
      )}
      {state.status === "done" && state.data.atm_strike && state.data.atm_expiry && (
        <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
          Measured from the {money(state.data.atm_strike, 0)} straddle expiring{" "}
          {formatDateShort(state.data.atm_expiry)}.
        </p>
      )}
      {(state.status === "idle" || state.status === "loading") && (
        <p className="text-sm text-[var(--color-muted)]">
          One click, one live options-chain fetch. Rate limited: use it when you need current
          numbers.
        </p>
      )}
    </Panel>
  );
}
