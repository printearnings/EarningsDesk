"use client";

import Link from "next/link";
import { useState } from "react";

import { SessionChip, VerdictChip } from "@/components/Chip";
import { Pagination } from "@/components/Pagination";
import { pctRange, relativeDays } from "@/lib/format";
import type { CalendarEntry } from "@/lib/types";

const PAGE_SIZE = 8;

/**
 * The Dashboard's "Next to report" panel — previously a hard `slice(0, 8)`
 * with no way to see the rest of the window without leaving for the full
 * /calendar/ page. Client-paginated over the same array the page already
 * fetched (the same "no extra request, the window is small enough to just
 * slice in the browser" pattern TickersScreener/MacroCalendarList use), so
 * paging forward costs nothing beyond a re-render.
 */
export function NextToReportList({ entries }: { entries: CalendarEntry[] }) {
  const [page, setPage] = useState(1);
  const paged = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <ul>
        {paged.map((entry) => (
          <li
            key={`${entry.ticker}-${entry.report_date}`}
            className="border-b border-[var(--color-border-subtle)] last:border-b-0"
          >
            <Link
              href={`/t/${entry.ticker}/`}
              className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-panel-soft)]"
            >
              <span className="w-14 font-mono text-sm font-medium text-[var(--color-heading)]">
                {entry.ticker}
              </span>
              <SessionChip session={entry.session} />
              <VerdictChip verdict={entry.verdict} />
              <span className="ml-auto text-right">
                <span className="tnum block text-sm font-medium text-[var(--color-heading)]">
                  {pctRange(entry.implied_move)}
                </span>
                <span className="text-sm text-[var(--color-muted)]">
                  {relativeDays(entry.days_until)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={entries.length}
        onPageChange={setPage}
      />
    </div>
  );
}
