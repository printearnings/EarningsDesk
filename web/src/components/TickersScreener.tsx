"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";

import { SessionChip, VerdictChip } from "@/components/Chip";
import { CompanyLogo } from "@/components/CompanyLogo";
import {
  DateRangeFilter,
  FilterDivider,
  FilterGroup,
  VERDICT_DOT,
  VERDICTS,
  toggleInSet,
} from "@/components/FilterGroup";
import { Pagination } from "@/components/Pagination";
import type { TickerIndexEntry } from "@/lib/api";
import { EMPTY, daysUntilFromDate, money, pctRange, relativeDays } from "@/lib/format";

type SortKey = "days" | "implied";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

const HEADERS: { key: SortKey | null; label: string }[] = [
  { key: null, label: "Ticker" },
  { key: null, label: "Price" },
  { key: "days", label: "Next report" },
  { key: "implied", label: "Implied move" },
  { key: null, label: "Verdict" },
];

/**
 * Every tracked ticker, sorted by how soon it reports — the question someone
 * trading earnings actually opens this page with is "what's coming up, and
 * is it worth a look," not "let me find NVDA alphabetically." Verdict
 * filtering narrows that further to "show me the mispriced ones."
 *
 * Deliberately thin: this is a triage list, not a research surface — every
 * row links to the ticker page for the actual decision-making detail (price
 * chart, options panel, history, financials). Duplicating that here would
 * just be a second, staler copy of it.
 */
export function TickersScreener({ tickers }: { tickers: TickerIndexEntry[] }) {
  const [verdicts, setVerdicts] = useState<Set<string>>(() => new Set());
  const [tickerQuery, setTickerQuery] = useState("");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("days");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const filtersActive =
    verdicts.size > 0 || tickerQuery.trim() !== "" || reportFrom !== "" || reportTo !== "";

  // Reset to page 1 whenever the filtered/sorted set changes shape, not just
  // on an explicit page click — done during render (the reset-on-prop-change
  // idiom this app uses elsewhere) so a filter change never leaves you
  // stranded on a page number the new result set doesn't have.
  const resetKey = `${[...verdicts].join(",")}|${tickerQuery}|${reportFrom}|${reportTo}|${sortKey}|${sortDir}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setPage(1);
  }

  function clearFilters() {
    setVerdicts(new Set());
    setTickerQuery("");
    setReportFrom("");
    setReportTo("");
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Days defaults to soonest-first (asc); implied move defaults to
      // biggest-first (desc) — each column's own natural reading order,
      // not one direction forced onto both.
      setSortDir(key === "days" ? "asc" : "desc");
    }
  }

  const rows = useMemo(() => {
    const q = tickerQuery.trim().toUpperCase();
    const matched = filtersActive
      ? tickers.filter((t) => {
          const verdictOk =
            verdicts.size === 0 || (t.verdict != null && verdicts.has(t.verdict));
          const tickerOk =
            q === "" ||
            t.ticker.includes(q) ||
            (t.company_name ?? "").toUpperCase().includes(q);
          // A ticker with no scheduled report has no date to compare — it
          // can't satisfy a range constraint, so it drops out rather than
          // ambiguously passing every date filter by default.
          const reportDateOk =
            (reportFrom === "" && reportTo === "") ||
            (t.next_report_date != null &&
              (reportFrom === "" || t.next_report_date >= reportFrom) &&
              (reportTo === "" || t.next_report_date <= reportTo));
          return verdictOk && tickerOk && reportDateOk;
        })
      : tickers;

    const withDays = matched.map((t) => {
      const raw = daysUntilFromDate(t.next_report_date);
      // A negative count means the stored next_report_date is stale (the
      // print already happened; the nightly refresh hasn't rolled it
      // forward to the following quarter yet) — treat it the same as "no
      // scheduled report" for sorting, or a stale row reads as the single
      // most urgent one to watch instead of the least.
      return { t, days: raw !== null && raw >= 0 ? raw : null };
    });
    // Tickers with no scheduled report sort last regardless of direction —
    // there's nothing to be "soonest" or "furthest" about.
    withDays.sort((a, b) => {
      const av = sortKey === "days" ? a.days : (a.t.implied_move ?? null);
      const bv = sortKey === "days" ? b.days : (b.t.implied_move ?? null);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return withDays.map((r) => r.t);
  }, [tickers, verdicts, tickerQuery, reportFrom, reportTo, filtersActive, sortKey, sortDir]);

  const pagedRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[var(--color-border)] px-5 py-4">
        <FilterGroup
          label="Verdict"
          options={VERDICTS}
          active={verdicts}
          dotClass={VERDICT_DOT}
          onToggle={(v) => toggleInSet(verdicts, setVerdicts, v)}
        />
        <FilterDivider />
        <div className="flex items-center gap-1.5">
          <span className="eyebrow text-[var(--color-muted)]">Ticker</span>
          <input
            type="text"
            value={tickerQuery}
            onChange={(e) => setTickerQuery(e.target.value)}
            placeholder="e.g. NVDA"
            className="text-2xs w-32 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 font-mono tracking-[0.06em] text-[var(--color-heading)] uppercase placeholder:tracking-normal placeholder:text-[var(--color-muted)] placeholder:normal-case focus:border-[var(--color-brand)] focus:outline-none"
          />
        </div>
        <FilterDivider />
        <DateRangeFilter
          label="Reports"
          from={reportFrom}
          to={reportTo}
          onFromChange={setReportFrom}
          onToChange={setReportTo}
        />
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
            ? `${rows.length} of ${tickers.length} tracked`
            : `${tickers.length} tracked`}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
          No tickers match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tnum w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] text-left">
                {HEADERS.map((h) =>
                  h.key ? (
                    <th key={h.label} className="eyebrow px-4 py-2.5 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort(h.key as SortKey)}
                        className="pressable inline-flex items-center gap-1 hover:text-[var(--color-heading)]"
                      >
                        {h.label}
                        {sortKey === h.key && (
                          <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                        )}
                      </button>
                    </th>
                  ) : (
                    <th key={h.label} className="eyebrow px-4 py-2.5 font-medium">
                      {h.label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((t) => {
                const days = daysUntilFromDate(t.next_report_date);
                return (
                  <motion.tr
                    key={t.ticker}
                    layout="position"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/t/${t.ticker}/`}
                        className="flex items-center gap-2 hover:underline"
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
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                      {money(t.spot)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {t.next_report_date ? (
                        <span className="flex items-center gap-1.5">
                          <SessionChip session={t.next_report_session} />
                          <span className="text-[var(--color-body)]">{relativeDays(days)}</span>
                        </span>
                      ) : (
                        EMPTY
                      )}
                    </td>
                    <td className="px-4 py-2.5">{pctRange(t.implied_move)}</td>
                    <td className="px-4 py-2.5">
                      <VerdictChip verdict={t.verdict} />
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPageChange={setPage} />
    </>
  );
}
