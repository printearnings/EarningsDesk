"use client";

import Link from "next/link";

import { Pagination } from "@/components/Pagination";
import { useState } from "react";

import { relativeDaysFromDate } from "@/lib/format";
import type { DashboardNewsItem } from "@/lib/types";

/**
 * Dashboard "Recent news" — single-line rows, paginated client-side so the
 * tile shows a fixed six per page (staying level with the Signals and Macro
 * tiles beside it) while still letting the reader page through everything the
 * nightly fetch pulled. Same "slice in the browser, no round trip" pattern as
 * NextToReportList.
 */

const PAGE_SIZE = 6;

export function NewsFeed({ items }: { items: DashboardNewsItem[] }) {
  const [page, setPage] = useState(1);
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <ul>
        {paged.map((item) => (
          <li
            key={item.url ?? `${item.ticker}-${item.title}`}
            className="flex items-center gap-2.5 border-b border-[var(--color-border-subtle)] px-5 py-3"
          >
            <Link
              href={`/t/${item.ticker}/`}
              className="w-11 shrink-0 text-xs font-semibold text-[var(--color-brand)] hover:underline"
            >
              {item.ticker}
            </Link>
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                title={item.title}
                className="min-w-0 flex-1 truncate text-sm text-[var(--color-heading)] underline-offset-4 hover:underline"
              >
                {item.title}
              </a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-heading)]">
                {item.title}
              </span>
            )}
            <span className="text-2xs shrink-0 text-[var(--color-muted)]">
              {relativeDaysFromDate(item.published_at)}
            </span>
          </li>
        ))}
      </ul>
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={items.length}
        onPageChange={setPage}
      />
    </div>
  );
}
