"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import { Card } from "@/components/TickerOverview";
import { MACRO_EVENTS, type MacroEvent } from "@/lib/macroEvents";
import type { CalendarEntry } from "@/lib/types";

import { CalendarList } from "./CalendarList";
import { DayPanel } from "./DayPanel";
import { HorizonStrip } from "./HorizonStrip";
import { MonthGrid } from "./MonthGrid";
import { type Names, addDays, buildCsv, downloadFile, parts, todayIso } from "./shared";

/**
 * The earnings calendar: a 30-day horizon strip on top, then either the
 * month grid with a day panel beside it, or one sortable list of everything
 * upcoming. Filters apply to all three.
 *
 * Deliberately absent: the directional lean (hidden site-wide until it earns
 * its place; shown in the day panel only once it has), and anything the data
 * doesn't carry (IV rank, flow labels, "gamma").
 */

type View = "month" | "list";
type VerdictFilter = "ALL" | "RICH" | "CHEAP" | "FAIR";
type SessionFilter = "ALL" | "BMO" | "AMC";

const MONTHS = [
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

const MOVE_FILTERS = [
  { value: 0, label: "All" },
  { value: 0.05, label: "> 5%" },
  { value: 0.1, label: "> 10%" },
];

// "Today" comes from the browser, but the static build rendered on some
// earlier day. Serving the build's as-of date during hydration and the real
// date right after keeps React from flagging a mismatch.
const noSubscribe = () => () => {};

export function EarningsCalendar({
  entries,
  names,
  asOf,
  showDirection,
}: {
  entries: CalendarEntry[];
  names: Names;
  /** The data's as-of date (the build day), used as "today" until hydration. */
  asOf: string;
  showDirection: boolean;
}) {
  const today = useSyncExternalStore(noSubscribe, todayIso, () => asOf);

  const [view, setView] = useState<View>("month");
  const [verdict, setVerdict] = useState<VerdictFilter>("ALL");
  const [session, setSession] = useState<SessionFilter>("ALL");
  const [minMove, setMinMove] = useState(0);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);

  const q = query.trim().toUpperCase();
  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (verdict !== "ALL" && e.verdict !== verdict) return false;
        if (session !== "ALL" && e.session !== session) return false;
        if (minMove > 0 && !((e.implied_move ?? 0) > minMove)) return false;
        if (q) {
          const name = (names[e.ticker]?.name ?? "").toUpperCase();
          if (!e.ticker.includes(q) && !name.includes(q)) return false;
        }
        return true;
      }),
    [entries, verdict, session, minMove, q, names],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.report_date) ?? [];
      list.push(e);
      map.set(e.report_date, list);
    }
    return map;
  }, [filtered]);

  const counts = useMemo(
    () => new Map([...byDate].map(([d, list]) => [d, list.length])),
    [byDate],
  );

  const macroByDate = useMemo(() => {
    const map = new Map<string, MacroEvent[]>();
    for (const m of MACRO_EVENTS) map.set(m.date, [...(map.get(m.date) ?? []), m]);
    return map;
  }, []);

  // Until a day is picked: today if anything reports, else the next day in
  // the coming month that has reports, else today.
  const defaultDay = useMemo(() => {
    for (let i = 0; i < 31; i++) {
      const d = addDays(today, i);
      if ((counts.get(d) ?? 0) > 0) return d;
    }
    return today;
  }, [counts, today]);
  const selected = picked ?? defaultDay;

  const sel = parts(selected);
  const month = cursor ?? { year: sel.y, month: sel.m };

  function selectDay(d: string) {
    setPicked(d);
    setCursor(null); // follow the picked day's month
  }
  function shiftMonth(delta: number) {
    const dt = new Date(month.year, month.month + delta, 1);
    setCursor({ year: dt.getFullYear(), month: dt.getMonth() });
  }
  function goToday() {
    setPicked(null);
    setCursor(null);
  }

  // What the filter counts and the CSV cover: the visible month, or
  // everything upcoming in the list view.
  const monthPrefix = `${month.year}-${String(month.month + 1).padStart(2, "0")}`;
  const scopeBase = useMemo(
    () =>
      view === "month"
        ? entries.filter((e) => e.report_date.startsWith(monthPrefix))
        : entries.filter((e) => e.report_date >= today),
    [view, entries, monthPrefix, today],
  );
  const scopeFiltered = useMemo(
    () =>
      view === "month"
        ? filtered.filter((e) => e.report_date.startsWith(monthPrefix))
        : filtered.filter((e) => e.report_date >= today),
    [view, filtered, monthPrefix, today],
  );
  const verdictCount = (v: VerdictFilter) =>
    v === "ALL" ? scopeBase.length : scopeBase.filter((e) => e.verdict === v).length;
  const sessionCount = (s: SessionFilter) =>
    s === "ALL" ? scopeBase.length : scopeBase.filter((e) => e.session === s).length;

  const filtersActive = verdict !== "ALL" || session !== "ALL" || minMove > 0 || q !== "";
  function clearFilters() {
    setVerdict("ALL");
    setSession("ALL");
    setMinMove(0);
    setQuery("");
  }

  function exportScope() {
    const label = view === "month" ? monthPrefix : `upcoming-${today}`;
    const rows = [...scopeFiltered].sort(
      (a, b) => a.report_date.localeCompare(b.report_date) || a.ticker.localeCompare(b.ticker),
    );
    downloadFile(`printearnings-${label}.csv`, buildCsv(rows, names), "text/csv;charset=utf-8");
  }

  const now = parts(today);
  const onTodayMonth = month.year === now.y && month.month === now.m;

  return (
    <div className="space-y-6">
      <Card className="px-5 py-4">
        <HorizonStrip
          counts={counts}
          macro={MACRO_EVENTS}
          today={today}
          selected={selected}
          onSelect={(d) => {
            selectDay(d);
            setView("month");
          }}
        />
      </Card>

      <Card className="space-y-3 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "month", label: "Month" },
                { value: "list", label: "List" },
              ]}
            />
            {view === "month" && (
              <div className="hidden items-center gap-1 sm:flex">
                <IconButton label="Previous month" onClick={() => shiftMonth(-1)}>
                  ‹
                </IconButton>
                <h2 className="min-w-[9.5rem] text-center text-lg font-semibold text-[var(--color-heading)]">
                  {MONTHS[month.month]} {month.year}
                </h2>
                <IconButton label="Next month" onClick={() => shiftMonth(1)}>
                  ›
                </IconButton>
                {(!onTodayMonth || picked !== null) && (
                  <button
                    type="button"
                    onClick={goToday}
                    className="pressable ml-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 font-mono text-xs text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]"
                  >
                    Today
                  </button>
                )}
              </div>
            )}
            {view === "list" && (
              <h2 className="text-lg font-semibold text-[var(--color-heading)]">
                Everything upcoming
              </h2>
            )}
          </div>
          <button
            type="button"
            onClick={exportScope}
            className="pressable inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 font-mono text-xs text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]"
          >
            Export CSV
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-border-subtle)] pt-3">
          <Segmented
            label="Verdict"
            value={verdict}
            onChange={setVerdict}
            options={(["ALL", "RICH", "CHEAP", "FAIR"] as const).map((v) => ({
              value: v,
              label: `${v === "ALL" ? "All" : v[0] + v.slice(1).toLowerCase()} (${verdictCount(v)})`,
              dot:
                v === "RICH"
                  ? "bg-[var(--color-verdict-rich)]"
                  : v === "CHEAP"
                    ? "bg-[var(--color-verdict-cheap)]"
                    : v === "FAIR"
                      ? "bg-[var(--color-verdict-fair)]"
                      : undefined,
            }))}
          />
          <Segmented
            label="Session"
            value={session}
            onChange={setSession}
            options={(["ALL", "BMO", "AMC"] as const).map((s) => ({
              value: s,
              label: `${s === "ALL" ? "All" : s} (${sessionCount(s)})`,
            }))}
          />
          <Segmented
            label="Implied"
            value={minMove}
            onChange={setMinMove}
            options={MOVE_FILTERS}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter ticker or company"
            aria-label="Filter by ticker or company"
            className="w-52 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-heading)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-brand)] focus:outline-none"
          />
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="font-mono text-xs text-[var(--color-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-heading)]"
            >
              Clear filters
            </button>
          )}
          <span className="ml-auto font-mono text-[11px] text-[var(--color-muted)]">
            {scopeFiltered.length} of {scopeBase.length} reports
          </span>
        </div>
      </Card>

      {view === "month" ? (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* A 7-column grid is unreadable on a phone; there the horizon strip
              above is the day picker and the day panel shows the detail. */}
          <Card className="hidden p-3 sm:block lg:col-span-8">
            <MonthGrid
              year={month.year}
              month={month.month}
              byDate={byDate}
              macroByDate={macroByDate}
              today={today}
              selected={selected}
              onSelect={selectDay}
            />
            <Legend />
          </Card>
          <div className="lg:sticky lg:top-20 lg:col-span-4">
            <DayPanel
              day={selected}
              entries={byDate.get(selected) ?? []}
              macro={macroByDate.get(selected) ?? []}
              names={names}
              today={today}
              showDirection={showDirection}
            />
          </div>
        </div>
      ) : (
        <Card>
          <CalendarList entries={scopeFiltered} names={names} today={today} />
        </Card>
      )}
    </div>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; dot?: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-muted)] uppercase">
        {label}
      </span>
      <div
        className="inline-flex flex-wrap rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5"
        role="group"
        aria-label={label}
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={on}
              className={`pressable inline-flex items-center gap-1.5 rounded-[4px] px-2 py-1 font-mono text-xs whitespace-nowrap transition-colors ${
                on
                  ? "bg-[var(--color-brand)]/12 font-semibold text-[var(--color-brand)]"
                  : "text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]"
              }`}
            >
              {o.dot && <span className={`h-1.5 w-1.5 rounded-full ${o.dot}`} aria-hidden />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="pressable flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-lg text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]"
    >
      {children}
    </button>
  );
}

function Legend() {
  const items = [
    { cls: "bg-[var(--color-verdict-rich)]", label: "Rich: pricing a bigger move than usual" },
    { cls: "bg-[var(--color-verdict-cheap)]", label: "Cheap: pricing a smaller move" },
    { cls: "bg-[var(--color-verdict-fair)]", label: "Fair" },
    { cls: "bg-[var(--color-viz-realized)]", label: "Macro print" },
  ];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 px-1 font-mono text-[11px] text-[var(--color-muted)]">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-sm ${i.cls}`} aria-hidden />
          {i.label}
        </li>
      ))}
      <li>BMO before the open · AMC after the close</li>
    </ul>
  );
}
