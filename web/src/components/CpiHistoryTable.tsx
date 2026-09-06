"use client";

import { CpiChart } from "@/components/CpiChart";
import { Panel } from "@/components/Panel";
import { pctRaw } from "@/lib/format";
import { useCpiHistory } from "@/lib/useCpiHistory";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * Actual released CPI prints, not just the upcoming release schedule
 * MacroCalendarList shows — headline and core, month-over-month and
 * year-over-year, computed live in the Worker from FRED's own CPIAUCSL/
 * CPILFESL series rather than a hand-maintained table, so this never goes
 * stale the way a static list of numbers would within a month or two.
 * No color-coding on the percentages: an inflation print isn't a
 * good/bad verdict this app can render a stance on, just a number, so it
 * stays in the same neutral ink every other data table uses.
 */
export function CpiHistoryTable() {
  const { data, loading } = useCpiHistory();

  return (
    <Panel
      title="CPI, as released"
      bodyClassName="px-0 py-0"
      empty={
        !loading && (!data || data.months.length === 0)
          ? "CPI data unavailable right now."
          : undefined
      }
    >
      {loading ? (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (
        data &&
        data.months.length > 0 && (
          <>
            {/* Charted above the table: the trend is what a reader wants
                first, and the table is the precise lookup behind it. */}
            <div className="border-b border-[var(--color-border)]">
              <CpiChart months={data.months} />
            </div>
            <div className="overflow-x-auto">
              <table className="tnum w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-table-head)] text-left">
                    {["Month", "Headline MoM", "Headline YoY", "Core MoM", "Core YoY"].map(
                      (h) => (
                        <th key={h} className="eyebrow px-3 py-2.5 font-medium">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr
                      key={m.month}
                      className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                        {monthLabel(m.month)}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-[var(--color-heading)]">
                        {pctRaw(m.mom_pct, 1)}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-[var(--color-heading)]">
                        {pctRaw(m.yoy_pct, 1)}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-body)]">
                        {pctRaw(m.core_mom_pct, 1)}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--color-body)]">
                        {pctRaw(m.core_yoy_pct, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
      {data && data.months.length > 0 && (
        <p className="text-2xs px-5 py-4 text-[var(--color-muted)]">Source: {data.source}.</p>
      )}
    </Panel>
  );
}
