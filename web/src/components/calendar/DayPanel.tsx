"use client";

import Link from "next/link";

import { DirectionChip, SessionChip, VerdictChip } from "@/components/Chip";
import { CompanyLogo } from "@/components/CompanyLogo";
import { compact, pct, pctRange, relativeDays } from "@/lib/format";
import type { MacroEvent } from "@/lib/macroEvents";
import type { CalendarEntry } from "@/lib/types";

import {
  type Names,
  buildCsv,
  buildIcs,
  byImpliedDesc,
  downloadFile,
  impliedClass,
  isThin,
  longDay,
  multiple,
  parts,
} from "./shared";

/**
 * Everything reporting on one day, beside the month grid: the day's average
 * implied move, how much of it prices RICH, the before-open / after-close
 * split, any macro print landing the same day, then each name with its
 * implied vs typical move. Ends in the two ways to take the list with you:
 * an .ics for your calendar and a CSV.
 */
export function DayPanel({
  day,
  entries,
  macro,
  names,
  today,
  showDirection,
}: {
  day: string;
  entries: CalendarEntry[];
  macro: MacroEvent[];
  names: Names;
  today: string;
  showDirection: boolean;
}) {
  const sorted = [...entries].sort(byImpliedDesc);
  const priced = sorted.filter((e) => typeof e.implied_move === "number");
  const avgImplied =
    priced.length > 0
      ? priced.reduce((s, e) => s + (e.implied_move ?? 0), 0) / priced.length
      : null;
  const withVerdict = sorted.filter((e) => e.verdict);
  const rich = withVerdict.filter((e) => e.verdict === "RICH").length;
  const bmo = sorted.filter((e) => e.session === "BMO").length;
  const amc = sorted.filter((e) => e.session === "AMC").length;

  const { y, m, d } = parts(day);
  const { y: ty, m: tm, d: td } = parts(today);
  const daysAway = Math.round(
    (new Date(y, m, d).getTime() - new Date(ty, tm, td).getTime()) / 86_400_000,
  );

  function exportIcs() {
    downloadFile(
      `printearnings-${day}.ics`,
      buildIcs(sorted, names, window.location.origin),
      "text/calendar;charset=utf-8",
    );
  }
  function exportCsv() {
    downloadFile(`printearnings-${day}.csv`, buildCsv(sorted, names), "text/csv;charset=utf-8");
  }

  return (
    <section
      className="rounded-[var(--radius-panel)] border border-[var(--color-panel-edge)]"
      style={{ background: "var(--gradient-tile)", boxShadow: "var(--shadow-card)" }}
      aria-label={`Reports on ${longDay(day)}`}
    >
      <header className="border-b border-[var(--color-border-subtle)] px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--color-muted)] uppercase">
            <span className="h-2 w-2 rounded-full bg-[var(--color-brand)]" aria-hidden />
            Day view
          </p>
          <span className="rounded-[4px] border border-[var(--color-border)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-body)]">
            {relativeDays(daysAway)}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-[var(--color-heading)]">{longDay(day)}</h2>
          {sorted.length > 0 && (
            <span className="rounded-[4px] border border-[var(--color-brand)]/40 bg-[var(--color-brand)]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[var(--color-brand)]">
              {sorted.length} report{sorted.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </header>

      {macro.length > 0 && (
        <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-viz-realized)]/10 px-5 py-2.5 text-sm text-[var(--color-body)]">
          {macro.map((mv) => (
            <p key={mv.type}>
              <span className="font-mono text-xs font-semibold text-[var(--color-viz-realized)] uppercase">
                Macro
              </span>{" "}
              {mv.label}, {mv.time}. A market-wide move can swamp a single print.
            </p>
          ))}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">
          No tracked reports on this day{macro.length > 0 ? ", only the macro print above" : ""}
          . Pick a bar in the strip or a day in the month.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 px-5 pt-4">
            {[
              {
                label: "Avg implied",
                value: pctRange(avgImplied) || "Not priced",
                cls: "text-[var(--color-heading)]",
              },
              {
                label: "Priced rich",
                value:
                  withVerdict.length > 0 ? pct(rich / withVerdict.length, 0) : "Not priced",
                cls:
                  rich > 0 ? "text-[var(--color-verdict-rich)]" : "text-[var(--color-heading)]",
              },
              {
                label: "Before / after",
                value: `${bmo} / ${amc}`,
                cls: "text-[var(--color-brand)]",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2 py-2 text-center"
              >
                <dt className="font-mono text-[10px] tracking-[0.08em] text-[var(--color-muted)] uppercase">
                  {s.label}
                </dt>
                <dd className={`tnum mt-1 font-mono text-base font-bold ${s.cls}`}>
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>

          <ul className="max-h-[34rem] space-y-2 overflow-y-auto px-5 py-4">
            {sorted.map((e) => {
              const mult = multiple(e);
              const thin = isThin(e);
              const name = names[e.ticker]?.name;
              return (
                <li key={e.ticker}>
                  <Link
                    href={`/t/${e.ticker}/`}
                    className="group block rounded-[var(--radius-md)] border border-[var(--color-border)] px-3.5 py-3 transition-colors hover:border-[var(--color-brand)]/50 hover:bg-[var(--color-panel-soft)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <CompanyLogo
                            ticker={e.ticker}
                            domain={names[e.ticker]?.domain}
                            size={16}
                          />
                          <span className="font-mono text-base font-bold text-[var(--color-heading)]">
                            {e.ticker}
                          </span>
                          <SessionChip session={e.session} tba={e.days_until >= 0} />
                          <VerdictChip verdict={e.verdict} />
                          {showDirection && <DirectionChip direction={e.direction} />}
                        </div>
                        {name && (
                          <p className="mt-0.5 truncate text-sm text-[var(--color-muted)]">
                            {name}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right font-mono">
                        {typeof e.implied_move === "number" ? (
                          <>
                            <p className={`tnum text-lg font-bold ${impliedClass(e.verdict)}`}>
                              {pctRange(e.implied_move)}
                            </p>
                            <p className="tnum text-[11px] text-[var(--color-muted)]">
                              Typ {pctRange(e.hist_avg_move) || "n/a"}
                              {mult !== null && ` · ${mult.toFixed(1)}×`}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-[var(--color-muted)]">Not priced yet</p>
                        )}
                      </div>
                    </div>
                    {(thin || e.atm_open_interest != null) && (
                      <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-[var(--color-muted)]">
                        <span>
                          ATM open interest {compact(e.atm_open_interest)}
                          {thin && (
                            <span
                              className="ml-2 rounded-[4px] border border-[var(--color-warning)]/40 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]"
                              title="Few contracts open at the at-the-money strike: wide spreads, hard to fill at a fair price."
                            >
                              Thin
                            </span>
                          )}
                        </span>
                        <span className="text-[var(--color-brand)] transition-transform group-hover:translate-x-0.5">
                          Open {e.ticker} →
                        </span>
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="space-y-2 border-t border-[var(--color-border-subtle)] px-5 py-4">
            <button
              type="button"
              onClick={exportIcs}
              className="pressable flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 font-mono text-sm font-bold text-[var(--color-on-brand)] transition-[filter] hover:brightness-110"
              style={{ background: "var(--gradient-brand)" }}
            >
              <CalendarPlusIcon />
              Add {sorted.length === 1 ? "it" : `all ${sorted.length}`} to your calendar (.ics)
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="pressable flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 font-mono text-xs font-medium text-[var(--color-body)] transition-colors hover:bg-[var(--color-panel-soft)]"
            >
              Export day as CSV
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function CalendarPlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3M8 8.5v3M6.5 10h3" />
    </svg>
  );
}
