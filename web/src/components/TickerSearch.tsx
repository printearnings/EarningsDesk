"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CompanyLogo } from "@/components/CompanyLogo";
import type { TickerIndexEntry } from "@/lib/types";
import { formatDateShort } from "@/lib/format";

/**
 * Ticker search over the prebuilt index.
 *
 * The whole index is ~39 entries and ships in the page, so filtering is a
 * synchronous array scan — no API, no debounce, no loading state. That's only
 * viable because the universe is small; past a few thousand tickers this would
 * need a real index and a request.
 *
 * Keyboard: ArrowUp/Down move, Enter opens, Escape closes. Without those this
 * is a search box you can only use with a mouse, which is the wrong shape for
 * a tool traders keep open.
 *
 * Search is not limited to the tracked universe. When the local index has no
 * matches, a debounced call to the Worker's `/api/search` (backed by
 * Massive's reference data — the same paid account /api/refresh uses) looks
 * up symbols AND company names, so "walmart" finds WMT even though the ticker
 * itself shares no substring with the query. Picking a remote result routes
 * to /lookup/, a client-rendered page that resolves arbitrary symbols live.
 * Static export can't pre-render a page for every possible ticker, so this is
 * the only way "search any stock" can actually work. A query shaped like a
 * ticker (1-6 letters) still gets a direct "Look up" row as a fallback if the
 * remote search comes back empty or errors — typos and thinly-covered names
 * shouldn't be dead ends either.
 */

const TICKER_SHAPE = /^[A-Z]{1,6}$/;
const REMOTE_SEARCH_DEBOUNCE_MS = 300;

interface RemoteMatch {
  ticker: string;
  name: string | null;
}
export function TickerSearch({
  tickers,
  placeholder = "Search a ticker",
  size = "md",
  autoFocus = false,
  compact = false,
}: {
  tickers: TickerIndexEntry[];
  placeholder?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
  /** Collapse to just the search icon below the `sm` breakpoint, expanding
   * to the full input on focus — the top bar is too narrow there to spend
   * on a placeholder nobody can finish reading anyway. Ignored at `sm` and
   * up, where there's room for the real thing. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const rawQuery = query.trim().toUpperCase();

  const matches = useMemo(() => {
    const q = rawQuery;
    if (!q) return [];
    return (
      tickers
        .filter((t) => t.ticker.includes(q))
        // Prefix matches first: typing "A" should surface AAPL before AMD's
        // neighbours that merely contain the letter.
        .sort((a, b) => {
          const aStarts = a.ticker.startsWith(q) ? 0 : 1;
          const bStarts = b.ticker.startsWith(q) ? 0 : 1;
          return aStarts - bStarts || a.ticker.localeCompare(b.ticker);
        })
        .slice(0, 8)
    );
  }, [rawQuery, tickers]);

  const trackedSet = useMemo(() => new Set(tickers.map((t) => t.ticker)), [tickers]);

  const [remote, setRemote] = useState<RemoteMatch[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);

  // Only the local index missing a match justifies a network call — a query
  // that already found something in the tracked universe has no reason to
  // spend a metered Massive lookup confirming it.
  const wantsRemote = matches.length === 0 && rawQuery.length >= 2;
  const remoteKey = wantsRemote ? rawQuery : "";

  // Clear stale remote results (and flip the loading flag) the instant the
  // query changes, before the debounced fetch below even fires — done during
  // render, the same reset-on-prop-change pattern useIntradayChart uses, so
  // there's no flash of a previous query's results under a new one.
  const [prevRemoteKey, setPrevRemoteKey] = useState(remoteKey);
  if (prevRemoteKey !== remoteKey) {
    setPrevRemoteKey(remoteKey);
    setRemote([]);
    setRemoteLoading(remoteKey !== "");
  }

  useEffect(() => {
    if (!wantsRemote) return;

    let cancelled = false;

    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(rawQuery)}`)
        .then((res) => (res.ok ? (res.json() as Promise<{ results: RemoteMatch[] }>) : null))
        .then((body) => {
          if (!cancelled) setRemote(body?.results ?? []);
        })
        .catch(() => {
          if (!cancelled) setRemote([]);
        })
        .finally(() => {
          if (!cancelled) setRemoteLoading(false);
        });
    }, REMOTE_SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wantsRemote, rawQuery]);

  // Whichever list is showing drives keyboard nav and the click targets below.
  // Local matches always win when present; remote only fills the gap.
  const items = useMemo(
    () =>
      matches.length > 0
        ? matches.map((t) => ({
            ticker: t.ticker,
            name: t.company_name,
            domain: t.company_domain,
            nextReportDate: t.next_report_date,
            tracked: true as const,
          }))
        : remote.map((r) => ({
            ticker: r.ticker,
            name: r.name,
            domain: null,
            nextReportDate: null,
            tracked: trackedSet.has(r.ticker),
          })),
    [matches, remote, trackedSet],
  );

  // Reset the highlighted row whenever the query changes. Done during render
  // rather than in an effect — React's documented pattern for "reset state
  // when an input changes" — since a plain `useEffect(() => setCursor(0),
  // [query])` is a synchronous setState-in-effect that costs an extra render.
  const [resetKey, setResetKey] = useState(query);
  if (resetKey !== query) {
    setResetKey(query);
    setCursor(0);
  }

  // Close on outside click. Without this the panel stays open behind whatever
  // the user clicks next.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(ticker: string) {
    setOpen(false);
    setQuery("");
    router.push(`/t/${ticker}/`);
  }

  function lookup(ticker: string) {
    setOpen(false);
    setQuery("");
    router.push(`/lookup/?ticker=${ticker}`);
  }

  function pick(item: (typeof items)[number]) {
    return item.tracked ? go(item.ticker) : lookup(item.ticker);
  }

  // Ticker-shaped and nothing found anywhere (local, or remote once it's
  // settled) — the "no results" state is itself a row, not a dead end.
  const offerLookup = items.length === 0 && !remoteLoading && TICKER_SHAPE.test(rawQuery);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);

    if (e.key === "Enter") {
      e.preventDefault();
      if (items.length) return pick(items[cursor]);
      if (offerLookup) return lookup(rawQuery);
      return;
    }

    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + items.length) % items.length);
    }
  }

  const input = size === "lg" ? "h-14 pl-12 pr-4 text-lg" : "h-9 pl-9 pr-3 text-sm";

  return (
    <div
      ref={containerRef}
      className={`relative transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)] ${
        compact ? "w-9 focus-within:w-full sm:w-full" : "w-full"
      }`}
    >
      <SearchIcon large={size === "lg"} />
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label="Search ticker"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={`w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-heading)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-brand)] focus:outline-none ${input}`}
      />

      {open && query.trim() && (
        // Popovers scale in from their trigger, never from center or from
        // scale(0) — nothing in the real world appears from nothing. Origin
        // is `top` since this always drops down from the input. `@starting-
        // style` is the modern no-JS way to animate a freshly-mounted element
        // in; it fires because React unmounts this div entirely when closed,
        // so every open is a real mount, not a visibility toggle.
        <div className="absolute z-20 mt-1 w-full origin-top overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] opacity-100 transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] starting:scale-95 starting:opacity-0">
          {items.length === 0 ? (
            remoteLoading ? (
              <p className="px-3 py-3 text-sm text-[var(--color-muted)]">Searching…</p>
            ) : offerLookup ? (
              <button
                type="button"
                onClick={() => lookup(rawQuery)}
                className="pressable flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-[var(--color-panel-soft)]"
              >
                <span className="text-[var(--color-muted)]">Look up</span>
                <span className="font-mono font-medium text-[var(--color-heading)]">
                  {rawQuery}
                </span>
                <span className="ml-auto text-[var(--color-muted)]" aria-hidden>
                  →
                </span>
              </button>
            ) : (
              <p className="px-3 py-3 text-sm text-[var(--color-muted)]">
                Type a ticker symbol to search.
              </p>
            )
          ) : (
            <ul>
              {items.map((item, i) => (
                <li key={item.ticker}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => pick(item)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                      i === cursor ? "bg-[var(--color-panel-soft)]" : ""
                    }`}
                  >
                    <CompanyLogo ticker={item.ticker} domain={item.domain} size={18} />
                    <span className="font-mono font-medium text-[var(--color-heading)]">
                      {item.ticker}
                    </span>
                    {item.name && (
                      <span className="truncate text-[var(--color-muted)]">{item.name}</span>
                    )}
                    {item.tracked && item.nextReportDate && (
                      <span className="ml-auto shrink-0 text-[var(--color-muted)]">
                        {formatDateShort(item.nextReportDate)}
                      </span>
                    )}
                    {!item.tracked && (
                      <span className="text-2xs ml-auto shrink-0 text-[var(--color-muted)]">
                        Look up
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SearchIcon({ large }: { large: boolean }) {
  return (
    <svg
      width={large ? 20 : 16}
      height={large ? 20 : 16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--color-muted)] ${
        large ? "left-4" : "left-3"
      }`}
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  );
}
