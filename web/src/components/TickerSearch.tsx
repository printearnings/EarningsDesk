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
 * Search is not limited to the tracked universe. A query that matches nothing
 * in the prebuilt index, but looks like a real ticker (1-6 letters), offers a
 * "Look up" action instead of a dead end — that routes to /lookup/, a client-
 * rendered page that resolves arbitrary symbols live via the Worker. Static
 * export can't pre-render a page for every possible ticker, so this is the
 * only way "search any stock" can actually work.
 */

const TICKER_SHAPE = /^[A-Z]{1,6}$/;
export function TickerSearch({
  tickers,
  placeholder = "Search a ticker",
  size = "md",
  autoFocus = false,
}: {
  tickers: TickerIndexEntry[];
  placeholder?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return tickers
      .filter((t) => t.ticker.includes(q))
      // Prefix matches first: typing "A" should surface AAPL before AMD's
      // neighbours that merely contain the letter.
      .sort((a, b) => {
        const aStarts = a.ticker.startsWith(q) ? 0 : 1;
        const bStarts = b.ticker.startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.ticker.localeCompare(b.ticker);
      })
      .slice(0, 8);
  }, [query, tickers]);

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

  // A query that's shaped like a ticker but matches nothing in the tracked
  // index still gets an option — the "no results" state is itself a row.
  const rawQuery = query.trim().toUpperCase();
  const offerLookup = matches.length === 0 && TICKER_SHAPE.test(rawQuery);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);

    if (e.key === "Enter") {
      e.preventDefault();
      if (matches.length) return go(matches[cursor].ticker);
      if (offerLookup) return lookup(rawQuery);
      return;
    }

    if (!matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + matches.length) % matches.length);
    }
  }

  const input =
    size === "lg"
      ? "h-14 pl-12 pr-4 text-lg"
      : "h-9 pl-9 pr-3 text-sm";

  return (
    <div ref={containerRef} className="relative w-full">
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
        <div
          className="absolute z-20 mt-1 w-full origin-top overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] opacity-100 transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] starting:scale-95 starting:opacity-0"
        >
          {matches.length === 0 ? (
            offerLookup ? (
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
              {matches.map((t, i) => (
                <li key={t.ticker}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(t.ticker)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                      i === cursor ? "bg-[var(--color-panel-soft)]" : ""
                    }`}
                  >
                    <CompanyLogo ticker={t.ticker} domain={t.company_domain} size={18} />
                    <span className="font-mono font-medium text-[var(--color-heading)]">
                      {t.ticker}
                    </span>
                    {t.company_name && (
                      <span className="truncate text-[var(--color-muted)]">
                        {t.company_name}
                      </span>
                    )}
                    {t.next_report_date && (
                      <span className="ml-auto shrink-0 text-[var(--color-muted)]">
                        {formatDateShort(t.next_report_date)}
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
