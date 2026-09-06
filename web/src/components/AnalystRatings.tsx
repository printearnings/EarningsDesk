"use client";

import { useMemo, useState } from "react";

import { toggleInSet } from "@/components/FilterGroup";
import { Panel } from "@/components/Panel";
import { EMPTY, formatDate, money } from "@/lib/format";
import type { AnalystRatingRow } from "@/lib/types";

/**
 * Analyst upgrade/downgrade history — who changed their call, when, and
 * what they moved the price target to.
 *
 * The aggregate consensus already sits in the key-figures grid; this is
 * the timeline behind it, which is the part that actually moves a stock
 * into a print. A cluster of downgrades the week before earnings is a
 * different setup than a stale "buy" from eight months ago.
 */

const ACTION_LABEL: Record<string, string> = {
  up: "Upgrade",
  down: "Downgrade",
  init: "Initiated",
  main: "Maintained",
  reit: "Reiterated",
};

// Filter chips render in this order rather than whatever order the feed
// happens to arrive in, so the control doesn't reshuffle between tickers.
const ACTION_ORDER = ["up", "down", "init", "main", "reit"] as const;

const ACTION_STYLE: Record<string, string> = {
  up: "border-[var(--color-positive)]/25 bg-[var(--color-verdict-cheap-bg)] text-[var(--color-positive)]",
  down: "border-[var(--color-negative)]/25 bg-[var(--color-verdict-rich-bg)] text-[var(--color-negative)]",
};

const NEUTRAL_STYLE =
  "border-[var(--color-border)] bg-[var(--color-verdict-fair-bg)] text-[var(--color-muted)]";

function ActionChip({ action }: { action: string | null | undefined }) {
  if (!action) return <span className="text-[var(--color-muted)]">{EMPTY}</span>;
  return (
    <span
      className={`text-2xs inline-flex items-center rounded-[var(--radius-chip)] border px-1.5 py-0.5 font-mono font-medium tracking-[0.06em] whitespace-nowrap uppercase ${
        ACTION_STYLE[action] ?? NEUTRAL_STYLE
      }`}
    >
      {ACTION_LABEL[action] ?? action}
    </span>
  );
}

/** "Hold → Buy" when the grade actually moved, just the new grade when it
 * didn't (a maintain/reiterate), blank when neither is known. */
function gradeChange(from: string | null | undefined, to: string | null | undefined) {
  if (!to) return EMPTY;
  if (!from || from === to) return to;
  return `${from} → ${to}`;
}

/** A target that moved renders both sides; one that didn't renders once.
 * Both null is a real case — plenty of actions carry no target at all. */
function targetChange(prior: number | null | undefined, current: number | null | undefined) {
  if (current === null || current === undefined) return EMPTY;
  if (prior === null || prior === undefined) return money(current);
  if (prior === current) return money(current);
  return `${money(prior)} → ${money(current)}`;
}

export function AnalystRatings({ rows }: { rows: AnalystRatingRow[] }) {
  const [actions, setActions] = useState<Set<string>>(() => new Set());
  const [year, setYear] = useState("");

  // Only offer filters the data actually contains — a Downgrade chip on a
  // ticker that has none is a dead control that can only ever report "0".
  const availableActions = useMemo(
    () => ACTION_ORDER.filter((a) => rows.some((r) => r.action === a)),
    [rows],
  );
  const years = useMemo(
    () => [...new Set(rows.map((r) => r.date.slice(0, 4)))].sort().reverse(),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (actions.size === 0 || (r.action != null && actions.has(r.action))) &&
          (year === "" || r.date.startsWith(year)),
      ),
    [rows, actions, year],
  );

  const filtersActive = actions.size > 0 || year !== "";

  if (rows.length === 0) {
    return (
      <Panel title="Analyst actions" empty="No recent analyst coverage for this symbol." />
    );
  }

  return (
    <Panel title="Analyst actions" bodyClassName="px-0 py-0">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--color-border)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow text-[var(--color-muted)]">Action</span>
          <div className="flex flex-wrap items-center gap-1">
            {availableActions.map((a) => {
              const isActive = actions.has(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleInSet(actions, setActions, a)}
                  aria-pressed={isActive}
                  className={`pressable text-2xs rounded-[var(--radius-chip)] border px-1.5 py-0.5 font-mono font-medium tracking-[0.06em] uppercase transition-colors ${
                    isActive
                      ? "border-[var(--color-heading)]/20 bg-[var(--color-panel-soft)] text-[var(--color-heading)]"
                      : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)]"
                  }`}
                >
                  {ACTION_LABEL[a] ?? a}
                </button>
              );
            })}
          </div>
        </div>

        {/* A dropdown rather than chips, matching FinancialsPanel's own year
            control — coverage can span several years, and unlike the action
            list that count isn't bounded. */}
        {years.length > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="eyebrow text-[var(--color-muted)]">Year</span>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              aria-label="Filter by year"
              className="text-2xs rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-[var(--color-heading)] focus:border-[var(--color-brand)] focus:outline-none"
            >
              <option value="">All</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}

        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setActions(new Set());
              setYear("");
            }}
            className="pressable text-2xs text-[var(--color-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-body)]"
          >
            Clear filters
          </button>
        )}

        <span className="text-2xs ml-auto text-[var(--color-muted)]">
          {filtered.length} of {rows.length} actions
        </span>
      </div>

      {filtered.length === 0 && (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
          No analyst actions match these filters.
        </p>
      )}

      <div className="overflow-x-auto" hidden={filtered.length === 0}>
        <table className="w-full min-w-[38rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-table-head)] text-left">
              <th className="eyebrow px-4 py-2.5 font-medium">Date</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Firm</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Action</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Rating</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Price target</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr
                key={`${r.date}-${r.firm}-${i}`}
                className="border-b border-[var(--color-border-subtle)] last:border-b-0"
              >
                {/* Full date, not the short form — coverage spans years, and
                    a bare "Aug 21" can't be told apart from the same day a
                    year earlier once the list runs long. */}
                <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                  {formatDate(r.date)}
                </td>
                <td className="px-4 py-2.5 font-medium text-[var(--color-heading)]">
                  {r.firm ?? EMPTY}
                </td>
                <td className="px-4 py-2.5">
                  <ActionChip action={r.action} />
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                  {gradeChange(r.from_grade, r.to_grade)}
                </td>
                <td className="tnum px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                  {targetChange(r.prior_price_target, r.current_price_target)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
