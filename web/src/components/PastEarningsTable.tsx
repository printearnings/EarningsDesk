"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DirectionChip, SessionChip, VerdictChip } from "@/components/Chip";
import {
  DIRECTION_DOT,
  DIRECTIONS,
  FilterGroup,
  VERDICT_DOT,
  VERDICTS,
  toggleInSet,
} from "@/components/FilterGroup";
import type { PastEarningsRow } from "@/lib/api";
import { eps, formatDateShort, money, pctRange, pctRaw, pctSigned, ratio } from "@/lib/format";

const HEADERS = [
  "Date",
  "Ticker",
  "Price",
  "EPS est",
  "EPS actual",
  "Surprise",
  "Implied",
  "Actual",
  "Gap",
  "Volume",
  "Call",
];

type SortDir = "asc" | "desc";

/**
 * Verdict/direction toggles (shared with the calendar) plus a ticker filter
 * — 281+ rows is a lot to scan for one name, and the global search box
 * navigates away rather than narrowing this table.
 */
export function PastEarningsTable({ rows }: { rows: PastEarningsRow[] }) {
  const [verdicts, setVerdicts] = useState<Set<string>>(() => new Set());
  const [directions, setDirections] = useState<Set<string>>(() => new Set());
  const [tickerQuery, setTickerQuery] = useState("");
  // Newest-first matches the order the API already returns (and the order
  // every other date-bearing table in the app uses) — "asc" is the one a
  // reader has to opt into.
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const filtersActive = verdicts.size > 0 || directions.size > 0 || tickerQuery.trim() !== "";

  function clearFilters() {
    setVerdicts(new Set());
    setDirections(new Set());
    setTickerQuery("");
  }

  const filtered = useMemo(() => {
    const q = tickerQuery.trim().toUpperCase();
    const matched = filtersActive
      ? rows.filter((r) => {
          const verdictOk =
            verdicts.size === 0 || (r.verdict != null && verdicts.has(r.verdict));
          const directionOk =
            directions.size === 0 || (r.direction != null && directions.has(r.direction));
          const tickerOk = q === "" || r.ticker.includes(q);
          return verdictOk && directionOk && tickerOk;
        })
      : rows;
    // report_date is an ISO "YYYY-MM-DD" string, so lexical comparison sorts
    // chronologically without a Date parse.
    return [...matched].sort((a, b) =>
      sortDir === "asc"
        ? a.report_date.localeCompare(b.report_date)
        : b.report_date.localeCompare(a.report_date),
    );
  }, [rows, verdicts, directions, tickerQuery, filtersActive, sortDir]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-border)] px-5 py-3">
        <FilterGroup
          label="Verdict"
          options={VERDICTS}
          active={verdicts}
          dotClass={VERDICT_DOT}
          onToggle={(v) => toggleInSet(verdicts, setVerdicts, v)}
        />
        <FilterGroup
          label="Direction"
          options={DIRECTIONS}
          active={directions}
          dotClass={DIRECTION_DOT}
          onToggle={(v) => toggleInSet(directions, setDirections, v)}
        />
        <div className="flex items-center gap-1.5">
          <span className="eyebrow text-[var(--color-muted)]">Ticker</span>
          <input
            type="text"
            value={tickerQuery}
            onChange={(e) => setTickerQuery(e.target.value)}
            placeholder="e.g. NVDA"
            className="text-2xs w-28 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 font-mono tracking-[0.06em] text-[var(--color-heading)] uppercase placeholder:tracking-normal placeholder:text-[var(--color-muted)] placeholder:normal-case focus:border-[var(--color-brand)] focus:outline-none"
          />
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="pressable text-2xs text-[var(--color-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-body)]"
          >
            Clear filters
          </button>
        )}
        <span className="text-2xs ml-auto text-[var(--color-muted)]">
          {filtersActive
            ? `${filtered.length} of ${rows.length} reports`
            : `${rows.length} reports`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
          No reports match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tnum w-full min-w-[54rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] text-left">
                {HEADERS.map((h) =>
                  h === "Date" ? (
                    <th key={h} className="eyebrow px-4 py-2.5 font-medium">
                      <button
                        type="button"
                        onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                        className="pressable inline-flex items-center gap-1 hover:text-[var(--color-heading)]"
                        aria-label={`Sort by date, currently ${sortDir === "asc" ? "oldest first" : "newest first"}`}
                      >
                        {h}
                        <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                      </button>
                    </th>
                  ) : (
                    <th key={h} className="eyebrow px-4 py-2.5 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={`${r.ticker}-${r.report_date}`}
                  className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                    {formatDateShort(r.report_date)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/t/${r.ticker}/`}
                      className="inline-flex items-center gap-2 font-mono font-medium text-[var(--color-heading)] hover:underline"
                    >
                      {r.ticker}
                      <SessionChip session={r.session} />
                    </Link>
                  </td>
                  <td
                    className="px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]"
                    title="Current price, not the price on the report date"
                  >
                    {money(r.spot)}
                  </td>
                  <td className="px-4 py-2.5">{eps(r.eps_estimate)}</td>
                  <td className="px-4 py-2.5">{eps(r.eps_actual)}</td>
                  <td
                    className={`px-4 py-2.5 ${
                      typeof r.eps_surprise === "number"
                        ? r.eps_surprise >= 0
                          ? "text-[var(--color-positive)]"
                          : "text-[var(--color-negative)]"
                        : ""
                    }`}
                  >
                    {pctRaw(r.eps_surprise)}
                  </td>
                  <td className="px-4 py-2.5">{pctRange(r.implied_move)}</td>
                  <td className="px-4 py-2.5">{pctSigned(r.realized_move)}</td>
                  <td className="px-4 py-2.5">
                    {pctSigned(r.gap_open_pct)}
                    {r.gap_filled === true && (
                      <span className="ml-1.5 font-mono tracking-[0.06em] text-[var(--color-muted)] text-[var(--text-2xs)] uppercase">
                        filled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{ratio(r.vol_ratio, 1)}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex gap-1.5">
                      <VerdictChip verdict={r.verdict} />
                      <DirectionChip direction={r.direction} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
