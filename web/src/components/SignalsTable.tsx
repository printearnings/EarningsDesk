"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DirectionChip, ResultChip, VerdictChip, WorkflowChip } from "@/components/Chip";
import {
  DIRECTION_DOT,
  DIRECTIONS,
  FilterGroup,
  VERDICT_DOT,
  VERDICTS,
  toggleInSet,
} from "@/components/FilterGroup";
import type { SignalRow } from "@/lib/api";
import { formatDateShort, money, num, pctRange } from "@/lib/format";

const HEADERS = [
  "Run date",
  "Ticker",
  "Price",
  "Report date",
  "Workflow",
  "Call",
  "Implied",
  "Edge",
  "Result",
];

const WORKFLOWS = ["A", "B"] as const;
const WORKFLOW_LABEL: Record<string, string> = { A: "VOL", B: "DIR" };

export function SignalsTable({ rows }: { rows: SignalRow[] }) {
  const [workflows, setWorkflows] = useState<Set<string>>(() => new Set());
  const [verdicts, setVerdicts] = useState<Set<string>>(() => new Set());
  const [directions, setDirections] = useState<Set<string>>(() => new Set());
  const [tickerQuery, setTickerQuery] = useState("");
  const filtersActive =
    workflows.size > 0 || verdicts.size > 0 || directions.size > 0 || tickerQuery.trim() !== "";

  function clearFilters() {
    setWorkflows(new Set());
    setVerdicts(new Set());
    setDirections(new Set());
    setTickerQuery("");
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
      return workflowOk && verdictOk && directionOk && tickerOk;
    });
  }, [rows, workflows, verdicts, directions, tickerQuery, filtersActive]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-border)] px-5 py-3">
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
                  className={`pressable text-2xs rounded-[var(--radius-chip)] border px-1.5 py-0.5 font-mono font-medium tracking-[0.06em] uppercase transition-colors ${
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
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] text-left">
                {HEADERS.map((h) => (
                  <th key={h} className="eyebrow px-5 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={`${row.ticker}-${row.run_date}-${row.workflow}`}
                  className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                >
                  <td className="px-5 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                    {formatDateShort(row.run_date)}
                  </td>
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/t/${row.ticker}/`}
                      className="font-mono font-medium text-[var(--color-heading)] hover:underline"
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
                      <DirectionChip direction={row.direction} />
                    </span>
                  </td>
                  <td className="px-5 py-2.5">{pctRange(row.implied_move)}</td>
                  <td className="px-5 py-2.5">{num(row.edge_score, 1)}</td>
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
    </>
  );
}
