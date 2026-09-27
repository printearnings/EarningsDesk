"use client";

import type { MacroEvent } from "@/lib/macroEvents";
import { formatDateShort } from "@/lib/format";

import { addDays, isWeekend, parts } from "./shared";

/**
 * The next 30 days at a glance: one bar per day, height = how many tracked
 * companies report, with the market-wide macro dates (jobs, CPI, PPI, FOMC)
 * flagged on top. It shows the busy weeks, and the days where a heavy
 * earnings session lands on a macro print, before anyone opens a month.
 *
 * Doubles as the day picker: clicking a bar selects that day (and on a phone,
 * where the month grid is hidden, it is the day picker).
 */

const HORIZON_DAYS = 30;

const MACRO_SHORT: Record<string, string> = {
  JOBS: "Jobs",
  CPI: "CPI",
  PPI: "PPI",
  FOMC: "FOMC",
};

export function HorizonStrip({
  counts,
  macro,
  today,
  selected,
  onSelect,
}: {
  /** Reports per ISO date, after filters. */
  counts: Map<string, number>;
  macro: MacroEvent[];
  today: string;
  selected: string;
  onSelect: (dateIso: string) => void;
}) {
  const days = Array.from({ length: HORIZON_DAYS }, (_, i) => addDays(today, i));
  const end = days[days.length - 1];
  const max = Math.max(1, ...days.map((d) => counts.get(d) ?? 0));
  const macroByDate = new Map(macro.map((m) => [m.date, m]));
  const inWindow = macro
    .filter((m) => m.date >= today && m.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = days.reduce((sum, d) => sum + (counts.get(d) ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[var(--color-panel-title)]">
          <span className="h-2 w-2 rounded-full bg-[var(--color-brand)]" aria-hidden />
          Next 30 days
        </h2>
        <p className="font-mono text-xs text-[var(--color-muted)]">
          {formatDateShort(today)} – {formatDateShort(end)} ·{" "}
          <span className="font-semibold text-[var(--color-heading)]">{total}</span> reports
        </p>
      </div>

      <div className="mt-3 overflow-x-auto pb-1">
        <div className="flex min-w-[42rem] items-end gap-1" role="list">
          {days.map((d) => {
            const n = counts.get(d) ?? 0;
            const m = macroByDate.get(d);
            const on = d === selected;
            const { d: dayNum, m: month } = parts(d);
            const firstOfMonth = dayNum === 1 || d === today;
            return (
              <div
                key={d}
                role="listitem"
                className="flex min-w-0 flex-1 flex-col items-center"
              >
                <span
                  className={`mb-1 h-4 font-mono text-[9px] leading-4 font-semibold whitespace-nowrap uppercase ${
                    m ? "text-[var(--color-viz-realized)]" : "text-transparent"
                  }`}
                  title={m ? `${m.label}, ${m.time}` : undefined}
                >
                  {m ? MACRO_SHORT[m.type] : "·"}
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(d)}
                  aria-pressed={on}
                  aria-label={`${formatDateShort(d)}: ${n} report${n === 1 ? "" : "s"}${m ? `, ${m.label}` : ""}`}
                  className={`group relative flex h-24 w-full flex-col justify-end rounded-[var(--radius-sm)] border px-0.5 pb-0.5 transition-colors ${
                    on
                      ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10"
                      : "border-transparent hover:bg-[var(--color-panel-soft)]"
                  }`}
                >
                  {n > 0 && (
                    <span className="tnum mb-0.5 text-center font-mono text-[10px] font-semibold text-[var(--color-heading)]">
                      {n}
                    </span>
                  )}
                  <span
                    className={`block w-full rounded-[3px] ${
                      n === 0
                        ? "bg-[var(--color-border-subtle)]"
                        : on
                          ? "bg-[var(--color-brand)]"
                          : "bg-[var(--color-brand)]/55 group-hover:bg-[var(--color-brand)]/80"
                    } ${m ? "ring-1 ring-[var(--color-viz-realized)]/70" : ""}`}
                    style={{ height: n === 0 ? 3 : `${Math.max(10, (n / max) * 64)}px` }}
                  />
                </button>
                <span
                  className={`mt-1 font-mono text-[10px] ${
                    d === today
                      ? "font-bold text-[var(--color-brand)]"
                      : isWeekend(d)
                        ? "text-[var(--color-muted)]/60"
                        : "text-[var(--color-muted)]"
                  }`}
                >
                  {dayNum}
                </span>
                <span className="h-3 font-mono text-[9px] text-[var(--color-muted)] uppercase">
                  {firstOfMonth
                    ? new Date(2000, month, 1).toLocaleDateString("en-US", { month: "short" })
                    : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {inWindow.length > 0 && (
        <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[var(--color-border-subtle)] pt-3 text-xs">
          <li className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-muted)] uppercase">
            Macro dates
          </li>
          {inWindow.map((m) => (
            <li key={`${m.type}-${m.date}`} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-[var(--color-viz-realized)]" aria-hidden />
              <button
                type="button"
                onClick={() => onSelect(m.date)}
                className="text-[var(--color-body)] hover:text-[var(--color-heading)] hover:underline"
              >
                <span className="font-mono font-semibold">{formatDateShort(m.date)}</span>{" "}
                {m.label} ({m.time})
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
