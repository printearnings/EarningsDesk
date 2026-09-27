"use client";

import { pctRange } from "@/lib/format";
import type { MacroEvent } from "@/lib/macroEvents";
import type { CalendarEntry } from "@/lib/types";

import { byImpliedDesc, impliedClass, isoOf, isWeekend } from "./shared";

/**
 * The month as a 6-week grid. Each day shows how many companies report and
 * the biggest implied moves; the whole cell selects the day, and the day
 * panel beside the grid carries the detail and the links. A cell holds no
 * links of its own, so it can be one real button without nesting
 * interactive elements.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VISIBLE = 3;

interface Cell {
  iso: string;
  day: number;
  inMonth: boolean;
}

function buildCells(year: number, month: number): Cell[] {
  const start = new Date(year, month, 1).getDay();
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(year, month, 1 - start + i);
    cells.push({
      iso: isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate()),
      day: dt.getDate(),
      inMonth: dt.getMonth() === month,
    });
  }
  // Drop a trailing week that's entirely next month.
  return cells.slice(35).every((c) => !c.inMonth) ? cells.slice(0, 35) : cells;
}

export function MonthGrid({
  year,
  month,
  byDate,
  macroByDate,
  today,
  selected,
  onSelect,
}: {
  year: number;
  month: number;
  byDate: Map<string, CalendarEntry[]>;
  macroByDate: Map<string, MacroEvent[]>;
  today: string;
  selected: string;
  onSelect: (dateIso: string) => void;
}) {
  const cells = buildCells(year, month);

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
      <div className="grid grid-cols-7 border-b border-[var(--color-border)] bg-[var(--color-table-head)]">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="py-2 text-center font-mono text-[11px] font-medium tracking-[0.1em] text-[var(--color-muted)] uppercase"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c) => {
          const list = [...(byDate.get(c.iso) ?? [])].sort(byImpliedDesc);
          const macro = macroByDate.get(c.iso) ?? [];
          const on = c.iso === selected;
          const isToday = c.iso === today;
          const weekend = isWeekend(c.iso);
          const rich = list.filter((e) => e.verdict === "RICH").length;
          return (
            <button
              key={c.iso}
              type="button"
              onClick={() => onSelect(c.iso)}
              aria-pressed={on}
              aria-label={`${c.iso}: ${list.length} report${list.length === 1 ? "" : "s"}${
                macro.length ? `, ${macro.map((m) => m.label).join(", ")}` : ""
              }`}
              className={`relative flex min-h-[7.5rem] flex-col border-r border-b border-[var(--color-border-subtle)] p-2 text-left transition-colors [&:nth-child(7n)]:border-r-0 ${
                on
                  ? "z-10 bg-[var(--color-brand)]/8 ring-2 ring-[var(--color-brand)] ring-inset"
                  : c.inMonth
                    ? weekend
                      ? "bg-[var(--color-panel-soft)]/60 hover:bg-[var(--color-panel-soft)]"
                      : "hover:bg-[var(--color-panel-soft)]"
                    : "bg-[var(--color-panel-soft)]/60 opacity-50 hover:opacity-80"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-mono text-sm ${
                    isToday
                      ? "bg-[var(--color-brand)] font-bold text-[var(--color-on-brand)]"
                      : "font-semibold text-[var(--color-heading)]"
                  }`}
                >
                  {c.day}
                </span>
                {list.length > 0 && (
                  <span className="rounded-[4px] border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-muted)]">
                    {list.length} print{list.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              {macro.length > 0 && (
                <span className="mt-1 self-start rounded-[3px] bg-[var(--color-viz-realized)]/15 px-1 font-mono text-[9px] font-bold text-[var(--color-viz-realized)] uppercase">
                  {macro.map((m) => (m.type === "JOBS" ? "Jobs" : m.type)).join(" · ")}
                </span>
              )}

              <ul className="mt-1.5 space-y-0.5">
                {list.slice(0, VISIBLE).map((e) => (
                  <li
                    key={e.ticker}
                    className="flex items-center justify-between gap-1 font-mono text-[11px]"
                  >
                    <span className="truncate font-semibold text-[var(--color-heading)]">
                      {e.ticker}
                    </span>
                    <span className={`tnum shrink-0 ${impliedClass(e.verdict)}`}>
                      {typeof e.implied_move === "number" ? pctRange(e.implied_move) : ""}
                    </span>
                  </li>
                ))}
              </ul>

              {list.length > VISIBLE && (
                <span className="mt-auto pt-1 font-mono text-[10px] text-[var(--color-muted)]">
                  +{list.length - VISIBLE} more
                  {rich > 0 && (
                    <span className="text-[var(--color-verdict-rich)]"> · {rich} rich</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
