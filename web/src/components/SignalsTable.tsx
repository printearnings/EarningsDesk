"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DirectionChip, ResultChip, VerdictChip, WorkflowChip } from "@/components/Chip";
import {
  DIRECTION_DOT,
  DIRECTIONS,
  DateRangeFilter,
  FilterDivider,
  FilterGroup,
  VERDICT_DOT,
  VERDICTS,
  toggleInSet,
} from "@/components/FilterGroup";
import { Pagination } from "@/components/Pagination";
import type { SignalRow } from "@/lib/api";
import { EMPTY, formatDateShort, money, pctRange } from "@/lib/format";

const PAGE_SIZE = 25;

const HEADERS = [
  "Run date",
  "Ticker",
  "Price",
  "Report date",
  "Workflow",
  "Call",
  "Implied",
  "Priced vs typical",
  "Result",
];

/**
 * Implied move as a multiple of the stock's typical move, e.g. "2.0×". This
 * replaced the 0-10 edge score, which is `min(10, richness * 20)` and so
 * pinned at 10.0 for anything priced at 1.5× or more: most RICH rows,
 * reading as a broken column. The multiple never caps and explains itself.
 */
function pricedMultiple(row: SignalRow): string {
  return typeof row.implied_move === "number" && row.hist_avg_move
    ? `${(row.implied_move / row.hist_avg_move).toFixed(1)}×`
    : EMPTY;
}

const WORKFLOWS = ["A", "B"] as const;
const WORKFLOW_LABEL: Record<string, string> = { A: "VOL", B: "DIR" };

export function SignalsTable({
  rows: allRows,
  directionNote = null,
}: {
  rows: SignalRow[];
  /** Set while the directional lean hasn't earned its place (see
   * lib/insights `directionNote`): the table then hides directional reads
   * and chips behind an explicit "include experimental" toggle. */
  directionNote?: string | null;
}) {
  const gated = directionNote !== null;
  const [showExperimental, setShowExperimental] = useState(false);
  const showDirection = !gated || showExperimental;
  const rows = useMemo(
    () => (showDirection ? allRows : allRows.filter((r) => r.workflow !== "B")),
    [allRows, showDirection],
  );
  const [workflows, setWorkflows] = useState<Set<string>>(() => new Set());
  const [verdicts, setVerdicts] = useState<Set<string>>(() => new Set());
  const [directions, setDirections] = useState<Set<string>>(() => new Set());
  const [tickerQuery, setTickerQuery] = useState("");
  const [runFrom, setRunFrom] = useState("");
  const [runTo, setRunTo] = useState("");
  const [page, setPage] = useState(1);
  const filtersActive =
    workflows.size > 0 ||
    verdicts.size > 0 ||
    directions.size > 0 ||
    tickerQuery.trim() !== "" ||
    runFrom !== "" ||
    runTo !== "";

  // Same reset-on-filter-change idiom as TickersScreener: a page number the
  // new, narrower result set doesn't have would otherwise show an empty page
  // instead of the first one.
  const resetKey = `${[...workflows].join(",")}|${[...verdicts].join(",")}|${[...directions].join(",")}|${tickerQuery}|${runFrom}|${runTo}|${showDirection}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setPage(1);
  }

  function clearFilters() {
    setWorkflows(new Set());
    setVerdicts(new Set());
    setDirections(new Set());
    setTickerQuery("");
    setRunFrom("");
    setRunTo("");
  }

  const filtered = useMemo(() => {
    if (!filtersActive) return rows;
    const q = tickerQuery.trim().toUpperCase();
    return rows.filter((r) => {
      const workflowOk = workflows.size === 0 || workflows.has(r.workflow);
      const verdictOk = verdicts.size === 0 || (r.verdict != null && verdicts.has(r.verdict));
      const directionOk =
        directions.size === 0 || (r.direction != null && directions.has(r.direction));
      const tickerOk = q === "" || r.ticker.includes(q);
      const runDateOk =
        (runFrom === "" || r.run_date >= runFrom) && (runTo === "" || r.run_date <= runTo);
      return workflowOk && verdictOk && directionOk && tickerOk && runDateOk;
    });
  }, [rows, workflows, verdicts, directions, tickerQuery, runFrom, runTo, filtersActive]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  return (
    <>
      {gated && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] px-5 py-3 text-sm text-[var(--color-muted)]">
          <span>{directionNote}</span>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[var(--color-body)]">
            <input
              type="checkbox"
              checked={showExperimental}
              onChange={(e) => setShowExperimental(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-brand)]"
            />
            Include experimental directional reads
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-[var(--color-border)] px-5 py-4">
        {showDirection && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="eyebrow text-[var(--color-muted)]">Workflow</span>
              <div className="flex items-center gap-1">
                {WORKFLOWS.map((w) => {
                  const isActive = workflows.has(w);
                  return (
                    <button
                      key={w}
                      type="button"
                      onClick={() => toggleInSet(workflows, setWorkflows, w)}
                      aria-pressed={isActive}
                      className={`pressable text-2xs rounded-[var(--radius-chip)] border px-1.5 py-0.5 font-medium tracking-[0.06em] uppercase transition-colors ${
                        isActive
                          ? "border-[var(--color-heading)]/20 bg-[var(--color-panel-soft)] text-[var(--color-heading)]"
                          : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)]"
                      }`}
                    >
                      {WORKFLOW_LABEL[w]}
                    </button>
                  );
                })}
              </div>
            </div>
            <FilterDivider />
          </>
        )}
        <FilterGroup
          label="Verdict"
          options={VERDICTS}
          active={verdicts}
          dotClass={VERDICT_DOT}
          onToggle={(v) => toggleInSet(verdicts, setVerdicts, v)}
        />
        <FilterDivider />
        {showDirection && (
          <>
            <FilterGroup
              label="Direction"
              options={DIRECTIONS}
              active={directions}
              dotClass={DIRECTION_DOT}
              onToggle={(v) => toggleInSet(directions, setDirections, v)}
            />
            <FilterDivider />
          </>
        )}
        <div className="flex items-center gap-1.5">
          <span className="eyebrow text-[var(--color-muted)]">Ticker</span>
          <input
            type="text"
            value={tickerQuery}
            onChange={(e) => setTickerQuery(e.target.value)}
            placeholder="e.g. NVDA"
            className="text-2xs w-28 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 tracking-[0.06em] text-[var(--color-heading)] uppercase placeholder:tracking-normal placeholder:text-[var(--color-muted)] placeholder:normal-case focus:border-[var(--color-brand)] focus:outline-none"
          />
        </div>
        <FilterDivider />
        <DateRangeFilter
          label="Run date"
          from={runFrom}
          to={runTo}
          onFromChange={setRunFrom}
          onToChange={setRunTo}
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
            ? `${filtered.length} of ${rows.length} signals`
            : `${rows.length} signals`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
          No signals match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tnum w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-table-head)] text-left">
                {HEADERS.map((h) => (
                  <th key={h} className="eyebrow px-5 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((row) => (
                <tr
                  key={`${row.ticker}-${row.run_date}-${row.workflow}`}
                  // CHEAP is the rare call that has carried the results (see the
                  // callout above the table), so its rows get a tint to be findable.
                  className={`border-b border-[var(--color-border-subtle)] last:border-b-0 ${
                    row.verdict === "CHEAP" ? "bg-[var(--color-verdict-cheap-bg)]" : ""
                  }`}
                >
                  <td className="px-5 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                    {formatDateShort(row.run_date)}
                  </td>
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/t/${row.ticker}/`}
                      className="font-medium text-[var(--color-heading)] hover:underline"
                    >
                      {row.ticker}
                    </Link>
                  </td>
                  <td
                    className="px-5 py-2.5 whitespace-nowrap text-[var(--color-body)]"
                    title="Current price, not the price at run date"
                  >
                    {money(row.spot)}
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                    {formatDateShort(row.report_date)}
                  </td>
                  <td className="px-5 py-2.5">
                    <WorkflowChip workflow={row.workflow} />
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="flex gap-1.5">
                      <VerdictChip verdict={row.verdict} />
                      {showDirection && <DirectionChip direction={row.direction} />}
                    </span>
                  </td>
                  <td className="px-5 py-2.5">{pctRange(row.implied_move)}</td>
                  <td className="px-5 py-2.5 font-mono">{pricedMultiple(row)}</td>
                  <td className="px-5 py-2.5">
                    <ResultChip
                      workflow={row.workflow}
                      beatImplied={row.beat_implied}
                      correctDirection={row.correct_direction}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        onPageChange={setPage}
      />
    </>
  );
}
