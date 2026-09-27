"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { SessionChip, VerdictChip } from "@/components/Chip";
import { Pagination } from "@/components/Pagination";
import { compact, formatDateShort, pctRange, relativeDays } from "@/lib/format";
import type { CalendarEntry } from "@/lib/types";

import { type Names, THIN_OI, impliedClass, isThin, multiple, parts } from "./shared";

/**
 * Every upcoming report as one sortable table: the fastest way to compare a
 * single number (implied move, or how far it sits from typical) down a list,
 * which a month grid can't do.
 */

type SortKey = "date" | "implied" | "multiple";
const PAGE_SIZE = 25;

function daysFrom(today: string, dateIso: string): number {
  const a = parts(today);
  const b = parts(dateIso);
  return Math.round(
    (new Date(b.y, b.m, b.d).getTime() - new Date(a.y, a.m, a.d).getTime()) / 86_400_000,
  );
}

function SortHead({
  k,
  sort,
  onSort,
  children,
  align = "left",
}: {
  k: SortKey;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  children: string;
  align?: "left" | "right";
}) {
  const on = sort === k;
  return (
    <th className={`px-3 py-2.5 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        aria-pressed={on}
        className={`inline-flex items-center gap-1 uppercase transition-colors ${
          on ? "text-[var(--color-brand)]" : "hover:text-[var(--color-heading)]"
        }`}
      >
        {children}
        <span aria-hidden>{on ? "↓" : "↕"}</span>
      </button>
    </th>
  );
}

export function CalendarList({
  entries,
  names,
  today,
}: {
  entries: CalendarEntry[];
  names: Names;
  today: string;
}) {
  const [sort, setSort] = useState<SortKey>("date");
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const list = [...entries];
    if (sort === "date") {
      list.sort(
        (a, b) =>
          a.report_date.localeCompare(b.report_date) || a.ticker.localeCompare(b.ticker),
      );
    } else if (sort === "implied") {
      list.sort((a, b) => (b.implied_move ?? -1) - (a.implied_move ?? -1));
    } else {
      list.sort((a, b) => (multiple(b) ?? -1) - (multiple(a) ?? -1));
    }
    return list;
  }, [entries, sort]);

  // Back to page 1 whenever the list or its order changes.
  const resetKey = `${sort}|${entries.length}|${entries[0]?.ticker ?? ""}`;
  const [prevKey, setPrevKey] = useState(resetKey);
  if (prevKey !== resetKey) {
    setPrevKey(resetKey);
    setPage(1);
  }

  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const priced = entries.filter((e) => typeof e.implied_move === "number");
  const median = (() => {
    const xs = priced.map((e) => e.implied_move as number).sort((a, b) => a - b);
    if (xs.length === 0) return null;
    const mid = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  })();

  if (entries.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-[var(--color-muted)]">
        No upcoming reports match these filters.
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-[var(--color-border-subtle)] sm:hidden">
        {paged.map((e) => {
          const mult = multiple(e);
          return (
            <li key={`${e.ticker}-${e.report_date}`}>
              <Link
                href={`/t/${e.ticker}/`}
                className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors active:bg-[var(--color-panel-soft)] ${
                  e.verdict === "CHEAP" ? "bg-[var(--color-verdict-cheap-bg)]" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-sm font-bold text-[var(--color-heading)]">
                      {e.ticker}
                    </span>
                    <VerdictChip verdict={e.verdict} />
                    {isThin(e) && (
                      <span className="rounded-[4px] border border-[var(--color-warning)]/40 px-1 font-mono text-[10px] font-semibold text-[var(--color-warning)]">
                        Thin
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--color-muted)]">
                    {formatDateShort(e.report_date)} ·{" "}
                    {relativeDays(daysFrom(today, e.report_date))}
                    {e.session ? ` · ${e.session}` : ""}
                    {names[e.ticker]?.name ? ` · ${names[e.ticker]?.name}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right font-mono">
                  {typeof e.implied_move === "number" ? (
                    <>
                      <span
                        className={`tnum block text-base font-bold ${impliedClass(e.verdict)}`}
                      >
                        {pctRange(e.implied_move)}
                      </span>
                      <span className="tnum block text-[11px] text-[var(--color-muted)]">
                        typ {pctRange(e.hist_avg_move) || "n/a"}
                        {mult !== null && ` · ${mult.toFixed(1)}×`}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--color-muted)]">Not priced yet</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="relative hidden overflow-x-auto sm:block">
        <table className="tnum w-full min-w-[56rem] font-mono text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[10px] tracking-[0.08em] text-[var(--color-muted)]">
              <SortHead k="date" sort={sort} onSort={setSort}>
                Date
              </SortHead>
              <th className="px-3 py-2.5 font-medium uppercase">Ticker &amp; name</th>
              <th className="px-3 py-2.5 font-medium uppercase">Session</th>
              <SortHead k="implied" sort={sort} onSort={setSort} align="right">
                Implied
              </SortHead>
              <th className="px-3 py-2.5 text-right font-medium uppercase">Typical</th>
              <SortHead k="multiple" sort={sort} onSort={setSort} align="right">
                Priced vs typical
              </SortHead>
              <th className="px-3 py-2.5 font-medium uppercase">Verdict</th>
              <th
                className="px-3 py-2.5 text-right font-medium uppercase"
                title={`Contracts open at the at-the-money strike. Under ${THIN_OI} is flagged thin: wide spreads, hard to fill.`}
              >
                ATM OI
              </th>
              <th className="px-4 py-2.5">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((e) => {
              const mult = multiple(e);
              const thin = isThin(e);
              return (
                <tr
                  key={`${e.ticker}-${e.report_date}`}
                  className={`border-b border-[var(--color-border-subtle)] transition-colors last:border-b-0 hover:bg-[var(--color-panel-soft)] ${
                    e.verdict === "CHEAP" ? "bg-[var(--color-verdict-cheap-bg)]" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-semibold text-[var(--color-heading)]">
                      {formatDateShort(e.report_date)}
                    </span>{" "}
                    <span className="text-xs text-[var(--color-muted)]">
                      {relativeDays(daysFrom(today, e.report_date))}
                    </span>
                  </td>
                  <td className="max-w-[16rem] px-3 py-2.5">
                    <span className="font-bold text-[var(--color-heading)]">{e.ticker}</span>{" "}
                    <span className="truncate font-sans text-[var(--color-body)]">
                      {names[e.ticker]?.name ?? ""}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <SessionChip session={e.session} />
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right text-base font-bold ${impliedClass(e.verdict)}`}
                  >
                    {typeof e.implied_move === "number" ? (
                      pctRange(e.implied_move)
                    ) : (
                      <span className="font-sans text-xs font-normal text-[var(--color-muted)]">
                        Not priced yet
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[var(--color-muted)]">
                    {pctRange(e.hist_avg_move)}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {mult !== null && (
                      <span className="rounded-[4px] border border-[var(--color-border)] px-1.5 py-0.5 text-xs text-[var(--color-body)]">
                        {mult.toFixed(1)}×
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <VerdictChip verdict={e.verdict} />
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-[var(--color-body)]">
                    {compact(e.atm_open_interest)}
                    {thin && (
                      <span className="ml-1.5 rounded-[4px] border border-[var(--color-warning)]/40 px-1 text-[10px] font-semibold text-[var(--color-warning)]">
                        Thin
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/t/${e.ticker}/`}
                      className="font-semibold whitespace-nowrap text-[var(--color-brand)] hover:underline"
                      aria-label={`Open ${e.ticker}`}
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border-subtle)] px-5 py-3 font-mono text-[11px] text-[var(--color-muted)]">
        <span>
          {entries.length} upcoming · {priced.length} priced
          {median !== null && ` · median implied ${pctRange(median)}`}
        </span>
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={sorted.length}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
