"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { CalendarEntry } from "@/lib/api";
import { pctRange } from "@/lib/format";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
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

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      const list = map.get(e.report_date) ?? [];
      list.push(e);
      map.set(e.report_date, list);
    }
    return map;
  }, [entries]);

  const weeks = useMemo(() => buildGrid(cursor.year, cursor.month, byDate, todayIso), [
    cursor,
    byDate,
    todayIso,
  ]);

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

  return (
    <div>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <h2 className="text-[15px] font-medium text-[var(--color-heading)]">
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToday}
            className="pressable rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-sm text-[var(--color-body)] transition-colors hover:bg-[var(--color-panel-soft)]"
          >
            Today
          </button>
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
  );
}

function DayCellView({ cell }: { cell: DayCell }) {
  const overflow = cell.entries.length - MAX_VISIBLE_PER_DAY;

  return (
    <div
      className={`min-h-24 border-b border-r border-[var(--color-border-subtle)] p-1.5 [&:nth-child(7n)]:border-r-0 ${
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
        {cell.entries.slice(0, MAX_VISIBLE_PER_DAY).map((e) => (
          <Link
            key={e.ticker}
            href={`/t/${e.ticker}/`}
            title={`${e.ticker} — implied ${pctRange(e.implied_move)}`}
            className="pressable flex items-center gap-1 rounded-[3px] px-1 py-0.5 text-2xs transition-colors hover:bg-[var(--color-panel-soft)]"
          >
            <VerdictDot verdict={e.verdict} />
            <span className="truncate font-mono font-medium text-[var(--color-heading)]">
              {e.ticker}
            </span>
          </Link>
        ))}
        {overflow > 0 && (
          <p className="px-1 text-2xs text-[var(--color-muted)]">+{overflow} more</p>
        )}
      </div>
    </div>
  );
}

const VERDICT_DOT: Record<string, string> = {
  RICH: "bg-[var(--color-verdict-rich)]",
  CHEAP: "bg-[var(--color-verdict-cheap)]",
  FAIR: "bg-[var(--color-verdict-fair)]",
};

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
    cells.push({ iso: dateIso, day, inMonth: false, isToday: dateIso === todayIso, entries: byDate.get(dateIso) ?? [] });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateIso = iso(year, month, day);
    cells.push({ iso: dateIso, day, inMonth: true, isToday: dateIso === todayIso, entries: byDate.get(dateIso) ?? [] });
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
