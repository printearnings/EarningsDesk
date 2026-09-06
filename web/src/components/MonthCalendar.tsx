"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { CalendarEntry } from "@/lib/api";
import { SessionChip } from "@/components/Chip";
import {
  DIRECTION_DOT,
  DIRECTIONS,
  FilterDivider,
  FilterGroup,
  SESSION_DOT,
  SESSIONS,
  VERDICT_DOT,
  VERDICTS,
  toggleInSet,
} from "@/components/FilterGroup";
import { money, pctRange, sessionLabel } from "@/lib/format";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MAX_VISIBLE_PER_DAY = 3;

interface DayCell {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  entries: CalendarEntry[];
}

/** ISO date string from calendar-local y/m/d — never via `Date#toISOString`,
 * which converts through UTC and can shift the date near midnight. */
function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `iso` shifted by `days` — calendar-local, same non-UTC reasoning as `iso`
 * itself. Only needs to handle small positive offsets (the mobile agenda's
 * default window), so no calendar-arithmetic library is warranted. */
function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return iso(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

const MOBILE_AGENDA_DEFAULT_WINDOW_DAYS = 14;

/**
 * A real month grid, navigable client-side over one wide-window payload — no
 * network request per month, since the tracked universe is small enough that
 * shipping ~1.5 years up front is cheaper than paging.
 */
export function MonthCalendar({ entries }: { entries: CalendarEntry[] }) {
  const todayIso = useMemo(() => {
    const now = new Date();
    return iso(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const [verdicts, setVerdicts] = useState<Set<string>>(() => new Set());
  const [directions, setDirections] = useState<Set<string>>(() => new Set());
  const [sessions, setSessions] = useState<Set<string>>(() => new Set());
  const filtersActive = verdicts.size > 0 || directions.size > 0 || sessions.size > 0;

  function clearFilters() {
    setVerdicts(new Set());
    setDirections(new Set());
    setSessions(new Set());
  }

  const filtered = useMemo(() => {
    if (!filtersActive) return entries;
    return entries.filter((e) => {
      const verdictOk = verdicts.size === 0 || (e.verdict != null && verdicts.has(e.verdict));
      const directionOk =
        directions.size === 0 || (e.direction != null && directions.has(e.direction));
      const sessionOk = sessions.size === 0 || (e.session != null && sessions.has(e.session));
      return verdictOk && directionOk && sessionOk;
    });
  }, [entries, verdicts, directions, sessions, filtersActive]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.report_date) ?? [];
      list.push(e);
      map.set(e.report_date, list);
    }
    return map;
  }, [filtered]);

  const weeks = useMemo(
    () => buildGrid(cursor.year, cursor.month, byDate, todayIso),
    [cursor, byDate, todayIso],
  );

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function goToday() {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
  }

  // The grid already opens on the current month and circles today's date —
  // a "Today" button sitting there unconditionally was a no-op most of the
  // time (you're already looking at it) and gave no signal for the one time
  // it actually does something: after you've paged away.
  const now = new Date();
  const onCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth();

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <h2 className="text-base font-semibold text-[var(--color-heading)]">
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </h2>
        <div className="flex items-center gap-1">
          {!onCurrentMonth && (
            <button
              type="button"
              onClick={goToday}
              className="pressable rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-sm text-[var(--color-body)] transition-colors hover:bg-[var(--color-panel-soft)]"
            >
              Jump to today
            </button>
          )}
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="pressable flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-body)] transition-colors hover:bg-[var(--color-panel-soft)]"
          >
            <ChevronIcon direction="left" />
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Next month"
            className="pressable flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-body)] transition-colors hover:bg-[var(--color-panel-soft)]"
          >
            <ChevronIcon direction="right" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--color-border)] px-5 py-4">
        <FilterGroup
          label="Verdict"
          options={VERDICTS}
          active={verdicts}
          dotClass={VERDICT_DOT}
          onToggle={(v) => toggleInSet(verdicts, setVerdicts, v)}
        />
        <FilterDivider />
        <FilterGroup
          label="Direction"
          options={DIRECTIONS}
          active={directions}
          dotClass={DIRECTION_DOT}
          onToggle={(v) => toggleInSet(directions, setDirections, v)}
        />
        <FilterDivider />
        <FilterGroup
          label="Session"
          options={SESSIONS}
          active={sessions}
          dotClass={SESSION_DOT}
          onToggle={(v) => toggleInSet(sessions, setSessions, v)}
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
        {filtersActive && (
          <span className="text-2xs ml-auto text-[var(--color-muted)]">
            {filtered.length} of {entries.length} events
          </span>
        )}
      </div>

      {/* The 7-column grid needs real column width to read at all — a phone
          screen crushes each ticker to 1-2 illegible letters. Below `sm`,
          an agenda list (one row per day that actually has something)
          replaces it; the grid returns once there's room for it. */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="eyebrow px-2 py-2 text-center">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {weeks.flat().map((cell) => (
            <DayCellView key={cell.iso} cell={cell} />
          ))}
        </div>
      </div>

      <AgendaView cells={weeks.flat()} todayIso={todayIso} onCurrentMonth={onCurrentMonth} />
    </div>
  );
}

/** Mobile fallback for the month grid: every in-month day with at least one
 * report, one row each, full ticker symbols instead of a truncated grid
 * cell. Days with nothing to report simply don't get a row — a list of
 * blank days would be scrolling for the sake of it.
 *
 * On the current month, this defaults to a rolling 14-day-ahead window
 * (matching the "reporting in 14 days" framing used elsewhere) rather than
 * the whole month — scrolling past every earlier day in the month just to
 * reach today, then past every reporting day after that too, was the actual
 * complaint. A past/future month reached via prev/next is a deliberate
 * browse, so it still shows in full; the cap only applies where a visitor
 * lands by default.
 */
function AgendaView({
  cells,
  todayIso,
  onCurrentMonth,
}: {
  cells: DayCell[];
  todayIso: string;
  onCurrentMonth: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const allDays = cells.filter((c) => c.inMonth && c.entries.length > 0);

  const windowEnd = useMemo(
    () => addDaysIso(todayIso, MOBILE_AGENDA_DEFAULT_WINDOW_DAYS),
    [todayIso],
  );
  const windowed =
    onCurrentMonth && !expanded
      ? allDays.filter((c) => c.iso >= todayIso && c.iso <= windowEnd)
      : allDays;
  // Whether the full month actually has anything outside the 14-day window
  // — no reason to offer a toggle that wouldn't change what's shown.
  const hasMore = onCurrentMonth && allDays.some((c) => c.iso < todayIso || c.iso > windowEnd);

  return (
    <div className="sm:hidden">
      <div className="divide-y divide-[var(--color-border-subtle)]">
        {windowed.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
            {allDays.length === 0
              ? "No reports match the current filters this month."
              : `Nothing in the next ${MOBILE_AGENDA_DEFAULT_WINDOW_DAYS} days. Try showing the full month.`}
          </p>
        ) : (
          windowed.map((cell) => (
            <div key={cell.iso} className="px-5 py-3">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                    cell.isToday
                      ? "bg-[var(--color-brand)] font-medium text-[var(--color-on-brand)]"
                      : "text-[var(--color-body)]"
                  }`}
                >
                  {cell.day}
                </span>
                <span className="text-sm text-[var(--color-muted)]">
                  {cell.entries.length} report{cell.entries.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="space-y-1.5 pl-8">
                {cell.entries.map((e) => (
                  <li key={e.ticker}>
                    <Link
                      href={`/t/${e.ticker}/`}
                      className="pressable flex items-center gap-2 rounded-[3px] py-0.5 text-sm transition-colors hover:bg-[var(--color-panel-soft)]"
                    >
                      <VerdictDot verdict={e.verdict} />
                      <span className="font-mono font-medium text-[var(--color-heading)]">
                        {e.ticker}
                      </span>
                      <SessionChip session={e.session} />
                      <span className="ml-auto shrink-0 text-[var(--color-muted)]">
                        {pctRange(e.implied_move)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {hasMore && (
        <div className="border-t border-[var(--color-border-subtle)] px-5 py-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="pressable text-sm text-[var(--color-body)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-heading)]"
          >
            {expanded
              ? `Show only the next ${MOBILE_AGENDA_DEFAULT_WINDOW_DAYS} days`
              : "Show the full month"}
          </button>
        </div>
      )}
    </div>
  );
}

function DayCellView({ cell }: { cell: DayCell }) {
  const overflow = cell.entries.length - MAX_VISIBLE_PER_DAY;

  return (
    <div
      className={`min-h-24 border-r border-b border-[var(--color-border-subtle)] p-1.5 [&:nth-child(7n)]:border-r-0 ${
        cell.inMonth ? "bg-[var(--color-panel)]" : "bg-[var(--color-panel-soft)]"
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
          cell.isToday
            ? "bg-[var(--color-brand)] font-medium text-[var(--color-on-brand)]"
            : cell.inMonth
              ? "text-[var(--color-body)]"
              : "text-[var(--color-muted)]"
        }`}
      >
        {cell.day}
      </span>

      <div className="mt-1 space-y-0.5">
        {cell.entries.slice(0, MAX_VISIBLE_PER_DAY).map((e) => {
          const session = sessionLabel(e.session);
          return (
            <Link
              key={e.ticker}
              href={`/t/${e.ticker}/`}
              title={`${e.ticker}${e.spot != null ? ` · ${money(e.spot)}` : ""} · implied ${pctRange(e.implied_move)}${session ? ` · reports ${session}` : ""}`}
              className="pressable flex items-center gap-1 rounded-[3px] px-1 py-0.5 text-xs transition-colors hover:bg-[var(--color-panel-soft)]"
            >
              <VerdictDot verdict={e.verdict} />
              <span className="truncate font-mono font-medium text-[var(--color-heading)]">
                {e.ticker}
              </span>
              {(e.session === "BMO" || e.session === "AMC") && (
                <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--color-muted)]">
                  {e.session}
                </span>
              )}
            </Link>
          );
        })}
        {overflow > 0 && (
          <Link
            href={`/calendar/day/?date=${cell.iso}`}
            className="pressable block rounded-[3px] px-1 text-xs text-[var(--color-muted)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--color-heading)]"
          >
            +{overflow} more
          </Link>
        )}
      </div>
    </div>
  );
}

function VerdictDot({ verdict }: { verdict?: string | null }) {
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
        verdict ? (VERDICT_DOT[verdict] ?? VERDICT_DOT.FAIR) : "bg-[var(--color-border)]"
      }`}
      aria-hidden
    />
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={direction === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} />
    </svg>
  );
}

/** A 6-row, 42-cell grid: the trailing/leading days from adjacent months keep
 * every row full, which is what makes a month grid read as a grid. */
function buildGrid(
  year: number,
  month: number,
  byDate: Map<string, CalendarEntry[]>,
  todayIso: string,
): DayCell[][] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: DayCell[] = [];

  for (let i = 0; i < startOffset; i++) {
    const day = daysInPrevMonth - startOffset + i + 1;
    const [y, m] = month === 0 ? [year - 1, 11] : [year, month - 1];
    const dateIso = iso(y, m, day);
    cells.push({
      iso: dateIso,
      day,
      inMonth: false,
      isToday: dateIso === todayIso,
      entries: byDate.get(dateIso) ?? [],
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateIso = iso(year, month, day);
    cells.push({
      iso: dateIso,
      day,
      inMonth: true,
      isToday: dateIso === todayIso,
      entries: byDate.get(dateIso) ?? [],
    });
  }

  let nextDay = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const [y, m] = month === 11 ? [year + 1, 0] : [year, month + 1];
    const dateIso = iso(y, m, nextDay);
    cells.push({
      iso: dateIso,
      day: nextDay,
      inMonth: false,
      isToday: dateIso === todayIso,
      entries: byDate.get(dateIso) ?? [],
    });
    nextDay++;
    if (cells.length >= 42) break;
  }

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
