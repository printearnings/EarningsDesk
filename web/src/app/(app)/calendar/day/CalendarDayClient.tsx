"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { SessionChip } from "@/components/Chip";
import { VERDICT_DOT } from "@/components/FilterGroup";
import { Panel } from "@/components/Panel";
import { EMPTY, formatDate, money, pctRange } from "@/lib/format";
import { useCalendarEntries } from "@/lib/useCalendarEntries";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Same hand-parsed-y/m/d approach as the calendar's `isoOf()` helper (components/calendar/shared) —
 * `new Date("2026-08-26")` reads as UTC midnight and can print the wrong
 * weekday west of Greenwich; building the Date from local parts avoids it. */
function weekdayName(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

function VerdictDot({ verdict }: { verdict?: string | null }) {
  return (
    <span
      className={`h-2 w-2 shrink-0 rounded-full ${
        verdict ? (VERDICT_DOT[verdict] ?? VERDICT_DOT.FAIR) : "bg-[var(--color-border)]"
      }`}
      aria-hidden
    />
  );
}

export function CalendarDayClient() {
  const params = useSearchParams();
  const date = params.get("date");
  const { entries, error } = useCalendarEntries();

  const dayEntries = useMemo(
    () => (entries && date ? entries.filter((e) => e.report_date === date) : null),
    [entries, date],
  );

  if (!date) {
    return (
      <div className="px-6 py-6">
        <Panel
          title="Day view"
          empty={
            <>
              No date given.{" "}
              <Link
                href="/calendar/"
                className="underline decoration-dotted underline-offset-2"
              >
                Back to the calendar
              </Link>
              .
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <Panel
        title={`${weekdayName(date)}, ${formatDate(date)}`}
        subtitle={
          dayEntries
            ? `${dayEntries.length} ticker${dayEntries.length === 1 ? "" : "s"} reporting`
            : undefined
        }
        action={
          <Link
            href="/calendar/"
            className="pressable text-sm text-[var(--color-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-heading)]"
          >
            ← Back to calendar
          </Link>
        }
        bodyClassName="px-0 py-0"
        empty={
          error
            ? "Could not load the calendar. Try again in a moment."
            : dayEntries === null
              ? "Loading…"
              : dayEntries.length === 0
                ? "No tracked tickers report on this date."
                : undefined
        }
      >
        {dayEntries && dayEntries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-table-head)] text-left">
                  <th className="eyebrow px-4 py-2.5 font-medium">Ticker</th>
                  <th className="eyebrow px-4 py-2.5 font-medium">Session</th>
                  <th className="eyebrow px-4 py-2.5 font-medium">Verdict</th>
                  <th className="eyebrow px-4 py-2.5 font-medium">Spot</th>
                  <th className="eyebrow px-4 py-2.5 font-medium">Implied move</th>
                </tr>
              </thead>
              <tbody>
                {dayEntries.map((e) => (
                  <tr
                    key={e.ticker}
                    className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/t/${e.ticker}/`}
                        className="pressable inline-flex items-center gap-2 font-medium text-[var(--color-heading)] hover:underline"
                      >
                        <VerdictDot verdict={e.verdict} />
                        {e.ticker}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <SessionChip session={e.session} tba={e.days_until >= 0} />
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-body)]">
                      {e.verdict ?? EMPTY}
                    </td>
                    <td className="tnum px-4 py-2.5 text-[var(--color-body)]">
                      {e.spot != null ? money(e.spot) : EMPTY}
                    </td>
                    <td className="tnum px-4 py-2.5 text-[var(--color-body)]">
                      {pctRange(e.implied_move)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
