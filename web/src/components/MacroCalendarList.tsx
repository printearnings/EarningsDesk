"use client";

import { useMemo, useState } from "react";

import { MacroEventChip } from "@/components/Chip";
import { FilterGroup, toggleInSet } from "@/components/FilterGroup";
import { StatCard } from "@/components/Panel";
import {
  EMPTY,
  daysUntilFromDate,
  formatDate,
  formatDateShort,
  relativeDays,
} from "@/lib/format";
import type { MacroEvent, MacroEventType } from "@/lib/macroEvents";

const TYPES: readonly MacroEventType[] = ["FOMC", "CPI", "PPI", "JOBS"];
const TYPE_DOT: Record<string, string> = {
  FOMC: "bg-[var(--color-viz-sma)]",
  CPI: "bg-[var(--color-viz-ema)]",
  PPI: "bg-[var(--color-viz-realized)]",
  JOBS: "bg-[var(--color-positive)]",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Calendar-local weekday, same UTC-shift-avoidance rationale as
 * MonthCalendar's `iso()` — parsing via `new Date(iso)` directly would read
 * a date near midnight UTC as the wrong local day. */
function weekday(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

/**
 * Upcoming FOMC decisions and CPI releases — the two macro dates that move
 * every ticker at once, not just the one reporting earnings that week.
 * Client-filtered over one small static list (see lib/macroEvents.ts) the
 * same way MonthCalendar filters its one-payload window — twenty events a
 * year doesn't need pagination or a network round trip per filter change.
 */
export function MacroCalendarList({ events }: { events: MacroEvent[] }) {
  const [types, setTypes] = useState<Set<string>>(() => new Set());

  const todayIso = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
  }, []);

  const upcoming = useMemo(
    () => events.filter((e) => e.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date)),
    [events, todayIso],
  );

  const nextFomc = upcoming.find((e) => e.type === "FOMC");
  const nextCpi = upcoming.find((e) => e.type === "CPI");
  const nextPpi = upcoming.find((e) => e.type === "PPI");
  const nextJobs = upcoming.find((e) => e.type === "JOBS");

  // No manual useMemo here — this list tops out around 20 rows a year, and
  // wrapping it broke the React Compiler's own memoization of `upcoming`
  // above rather than adding anything.
  const filtered = types.size === 0 ? upcoming : upcoming.filter((e) => types.has(e.type));

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 border-b border-[var(--color-border)] p-5 sm:grid-cols-4">
        <StatCard
          label="Next FOMC"
          value={nextFomc ? formatDate(nextFomc.date) : EMPTY}
          hint="Next scheduled rate decision."
          delta={nextFomc && relativeDays(daysUntilFromDate(nextFomc.date))}
        />
        <StatCard
          label="Next CPI"
          value={nextCpi ? formatDate(nextCpi.date) : EMPTY}
          hint="Next scheduled consumer-inflation report."
          delta={nextCpi && relativeDays(daysUntilFromDate(nextCpi.date))}
        />
        <StatCard
          label="Next PPI"
          value={nextPpi ? formatDate(nextPpi.date) : EMPTY}
          hint="Next producer-inflation report (headline and core PPI)."
          delta={nextPpi && relativeDays(daysUntilFromDate(nextPpi.date))}
        />
        <StatCard
          label="Next jobs report"
          value={nextJobs ? formatDate(nextJobs.date) : EMPTY}
          hint="Next BLS Employment Situation (nonfarm payrolls)."
          delta={nextJobs && relativeDays(daysUntilFromDate(nextJobs.date))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--color-border)] px-5 py-4">
        <FilterGroup
          label="Type"
          options={TYPES}
          active={types}
          dotClass={TYPE_DOT}
          onToggle={(v) => toggleInSet(types, setTypes, v)}
        />
        {types.size > 0 && (
          <button
            type="button"
            onClick={() => setTypes(new Set())}
            className="pressable text-2xs text-[var(--color-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-body)]"
          >
            Clear filters
          </button>
        )}
        <span className="text-2xs ml-auto text-[var(--color-muted)]">
          {filtered.length} upcoming
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
          No upcoming events match this filter.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border-subtle)]">
          {filtered.map((e) => (
            <li
              key={`${e.type}-${e.date}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3.5"
            >
              {/* On mobile this row (date, chip, days-until) takes the full
                  width and wraps onto its own line, so the label below never
                  has to compete with it for space — that's what was causing
                  long labels ("2-day meeting: ... with Summary of Economic
                  Projections") to get clipped instead of wrapping. At `sm`
                  and up it drops back to `w-auto` and sits inline as before. */}
              <div className="flex w-full items-center gap-4 sm:w-auto">
                <div className="w-20 shrink-0">
                  <div className="text-sm font-medium text-[var(--color-heading)]">
                    {formatDateShort(e.date)}
                  </div>
                  <div className="text-2xs text-[var(--color-muted)]">{weekday(e.date)}</div>
                </div>

                <MacroEventChip type={e.type} />

                <div className="tnum ml-auto shrink-0 text-right text-sm text-[var(--color-muted)] sm:hidden">
                  {relativeDays(daysUntilFromDate(e.date))}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm text-[var(--color-body)]">{e.label}</div>
                {e.meetingStart && (
                  <div className="text-2xs mt-0.5 text-[var(--color-muted)]">
                    2-day meeting: {formatDateShort(e.meetingStart)}–
                    {Number(e.date.slice(8, 10))}
                    {e.hasProjections ? " · with Summary of Economic Projections" : ""}
                  </div>
                )}
              </div>

              <div className="hidden shrink-0 text-sm text-[var(--color-muted)] sm:block">
                {e.time}
              </div>

              <div className="tnum hidden shrink-0 text-right text-sm text-[var(--color-muted)] sm:block">
                {relativeDays(daysUntilFromDate(e.date))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
