import Link from "next/link";
import type { ReactNode } from "react";

import { DirectionChip, MacroEventChip, SessionChip, VerdictChip } from "@/components/Chip";
import { ImpliedMoveTrend, type TrendPoint } from "@/components/ImpliedMoveTrend";
import { NewsFeed } from "@/components/NewsFeed";
import { Panel } from "@/components/Panel";
import { Card } from "@/components/TickerOverview";
import { TopBar } from "@/components/TopBar";
import {
  getCalendar,
  getDashboardNews,
  getIndex,
  getPastEarnings,
  getSignals,
  getTrackRecord,
} from "@/lib/api";
import {
  formatDate,
  formatDateShort,
  pct,
  pctRange,
  relativeDays,
  relativeDaysFromDate,
} from "@/lib/format";
import { MACRO_EVENTS } from "@/lib/macroEvents";

export const metadata = { title: "Dashboard | PrintEarnings" };

const PANEL_ACTION_CLASS =
  "pressable inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-[var(--color-brand)] transition-colors hover:bg-[var(--color-panel-soft)]";

// The Monday (UTC) that starts the week a date falls in — the bucket key for
// the weekly implied-move trend.
function mondayISO(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function shortMonth(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Average implied move per week over the last 8 weeks, from real past prints. */
function buildTrend(
  rows: { report_date: string; implied_move?: number | null }[],
): TrendPoint[] {
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (typeof r.implied_move !== "number") continue;
    const key = mondayISO(r.report_date);
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += r.implied_move;
    b.n += 1;
    buckets.set(key, b);
  }
  const thisMonday = mondayISO(new Date().toISOString());
  const base = new Date(`${thisMonday}T00:00:00Z`);
  const weeks: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }
  return weeks
    .map((m) => {
      const b = buckets.get(m);
      return b && b.n > 0 ? { label: shortMonth(m), value: b.sum / b.n } : null;
    })
    .filter((p): p is TrendPoint => p !== null);
}

/**
 * The overview, in the terminal layout: four headline cards, the
 * implied-move trend beside this week's biggest pricing gaps, the reporting-
 * soon table, then signals, macro dates and news.
 *
 * Every figure is real build-time data. The copy describes pricing and
 * outcomes, and never tells anyone what to trade.
 */
export default async function DashboardPage() {
  const [index, calendar, signals, record, news, past] = await Promise.all([
    getIndex(),
    getCalendar(7),
    getSignals(),
    getTrackRecord(),
    getDashboardNews(),
    getPastEarnings(),
  ]);

  const entries = calendar.entries;
  const priced = entries.filter((e) => typeof e.implied_move === "number");
  const avgImplied =
    priced.length > 0
      ? priced.reduce((sum, e) => sum + (e.implied_move ?? 0), 0) / priced.length
      : null;

  // The clearest rich/cheap edges this week, strongest first: the "look at
  // these" shortlist a trade-and-go reader wants, next to the trend chart.
  //
  // Ranked by how far the priced move sits from the typical one, in either
  // direction (2.0x rich and 0.5x cheap are equally far), not by edge_score,
  // which caps at 10 and would tie most RICH names.
  const gap = (e: (typeof entries)[number]) => {
    const r = (e.implied_move ?? 0) / (e.hist_avg_move || Infinity);
    return r > 0 ? Math.max(r, 1 / r) : 0;
  };
  const topSetups = [...entries]
    .filter(
      (e) =>
        (e.verdict === "RICH" || e.verdict === "CHEAP") &&
        typeof e.implied_move === "number" &&
        !!e.hist_avg_move,
    )
    .sort((a, b) => gap(b) - gap(a))
    .slice(0, 5);

  const withVerdict = entries.filter((e) => e.verdict);
  const richCount = entries.filter((e) => e.verdict === "RICH").length;

  const trend = buildTrend(past.rows);
  const latestTrend = trend.length > 0 ? trend[trend.length - 1].value : null;
  const trendPrints = past.rows.filter((r) => typeof r.implied_move === "number").length;

  const reporters = entries.slice(0, 10);

  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingMacro = MACRO_EVENTS.filter((e) => e.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  return (
    <>
      <TopBar title="Dashboard" eyebrow="Overview" tickers={index.tickers} />

      <div className="space-y-6 px-6 pb-10">
        {/* KPI row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DashKpi
            label="Reporting this week"
            icon={<CalendarIcon />}
            value={String(entries.length)}
            badge={<Pill>Next 7 days</Pill>}
            sub="Companies with a scheduled earnings print"
          />
          <DashKpi
            label="Avg implied move"
            icon={<TrendIcon />}
            value={pctRange(avgImplied) || "No data"}
            badge={
              priced.length > 0 ? (
                <span className="font-mono text-xs text-[var(--color-muted)]">
                  across {priced.length} prints
                </span>
              ) : undefined
            }
            sub="Mean at-the-money straddle move, this week's reporters"
          />
          <DashKpi
            label="Rich verdicts"
            icon={<BarsIcon />}
            value={String(richCount)}
            valueClass={
              richCount > 0 ? "text-[var(--color-verdict-rich)]" : "text-[var(--color-muted)]"
            }
            badge={
              withVerdict.length > 0 ? (
                <Pill tone="rich">{pct(richCount / withVerdict.length, 0)} of priced</Pill>
              ) : undefined
            }
            sub="Pricing a bigger move than the stock's usual"
          />
          <DashKpi
            label="Verdict accuracy"
            icon={<CheckIcon />}
            value={record.accuracy === null ? "Too early" : pct(record.accuracy, 0)}
            valueClass={
              record.accuracy === null
                ? "text-[var(--color-muted)]"
                : "text-[var(--color-brand)]"
            }
            badge={
              record.accuracy === null ? undefined : (
                <span className="font-mono text-xs text-[var(--color-muted)]">
                  {record.correct}/{record.directional} right
                </span>
              )
            }
            sub={
              <Link href="/track-record/" className="hover:underline">
                Rich/cheap calls scored against outcomes →
              </Link>
            }
          />
        </div>

        {/* Hero: implied-move trend + this week's top setups. */}
        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-3">
          <Card className="flex flex-col px-5 py-4 xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div>
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-panel-title)]">
                  Implied move
                </h2>
                <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                  Average implied move of each week&rsquo;s reporters, last 8 weeks
                </p>
              </div>
              {latestTrend !== null && (
                <p className="font-mono text-sm text-[var(--color-muted)]">
                  This week:{" "}
                  <span className="tnum text-xl font-bold text-[var(--color-brand)]">
                    {pctRange(latestTrend)}
                  </span>
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-1 items-center rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] px-2 py-3">
              <ImpliedMoveTrend points={trend} />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 font-mono text-[11px] text-[var(--color-muted)]">
              <span>From {trendPrints} past prints with an implied move</span>
              <span>Updated {formatDate(calendar.as_of)}</span>
            </div>
          </Card>

          <Card className="flex flex-col">
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
              <div>
                <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-panel-title)]">
                  Top setups this week
                </h2>
                <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                  Biggest gap between priced and typical move
                </p>
              </div>
              {topSetups.length > 0 && <Pill>{topSetups.length} setups</Pill>}
            </div>
            {topSetups.length === 0 ? (
              <p className="flex-1 px-5 py-8 text-sm text-[var(--color-muted)]">
                No rich or cheap setups priced yet this week.
              </p>
            ) : (
              <ul className="flex flex-1 flex-col gap-2 px-4 pb-4">
                {topSetups.map((e) => (
                  <li key={`${e.ticker}-${e.report_date}`} className="flex flex-1">
                    <Link
                      href={`/t/${e.ticker}/`}
                      className="group flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3.5 py-2.5 transition-colors hover:border-[var(--color-brand)]/50 hover:bg-[var(--color-panel-soft)]"
                    >
                      <span className="w-12 font-mono text-sm font-bold text-[var(--color-heading)]">
                        {e.ticker}
                      </span>
                      {e.verdict && <VerdictChip verdict={e.verdict} />}
                      <span className="ml-auto flex flex-col items-end font-mono">
                        <span className="tnum text-sm font-semibold text-[var(--color-brand)]">
                          {pctRange(e.implied_move)}
                        </span>
                        <span className="tnum text-[11px] text-[var(--color-muted)]">
                          vs {pctRange(e.hist_avg_move)} typical
                        </span>
                      </span>
                      <span
                        className="text-[var(--color-muted)] transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      >
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Reporting soon: a table reads faster than cards when comparing
            one number (the implied move) down a list. */}
        <Panel
          title="Reporting soon"
          subtitle="The next reports, with the move options are pricing"
          bodyClassName="px-0 py-0"
          action={
            <Link href="/calendar/" className={PANEL_ACTION_CLASS}>
              Full calendar <span aria-hidden>→</span>
            </Link>
          }
          empty={entries.length === 0 ? "Nothing scheduled in the window." : undefined}
        >
          {/* Phones: one stacked row per name, so the implied move is never
              scrolled off-screen. The table takes over from sm up. */}
          <ul className="divide-y divide-[var(--color-border-subtle)] sm:hidden">
            {reporters.map((e) => (
              <li key={`${e.ticker}-${e.report_date}`}>
                <Link
                  href={`/t/${e.ticker}/`}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors active:bg-[var(--color-panel-soft)]"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[var(--color-heading)]">
                        {e.ticker}
                      </span>
                      <VerdictChip verdict={e.verdict} />
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-[var(--color-muted)]">
                      {relativeDays(e.days_until)}
                      <SessionChip session={e.session} />
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono">
                    <span className="tnum block text-base font-bold text-[var(--color-brand)]">
                      {pctRange(e.implied_move)}
                    </span>
                    {e.hist_avg_move ? (
                      <span className="tnum block text-[11px] text-[var(--color-muted)]">
                        vs {pctRange(e.hist_avg_move)} typical
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="relative hidden overflow-x-auto sm:block">
            <table className="tnum w-full min-w-[40rem] font-mono text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[10px] tracking-[0.08em] text-[var(--color-muted)] uppercase">
                  <th className="px-5 py-2.5 font-medium">Ticker</th>
                  <th className="px-3 py-2.5 font-medium">Timing</th>
                  <th className="px-3 py-2.5 font-medium">Session</th>
                  <th className="px-3 py-2.5 text-right font-medium">Implied move</th>
                  <th className="px-3 py-2.5 text-right font-medium">Typical</th>
                  <th className="px-3 py-2.5 font-medium">Verdict</th>
                  <th className="px-5 py-2.5 text-right font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {reporters.map((e) => (
                  <tr
                    key={`${e.ticker}-${e.report_date}`}
                    className="border-b border-[var(--color-border-subtle)] transition-colors last:border-b-0 hover:bg-[var(--color-panel-soft)]"
                  >
                    <td className="px-5 py-2.5 font-bold text-[var(--color-heading)]">
                      {e.ticker}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-body)]">
                      {relativeDays(e.days_until)}
                    </td>
                    <td className="px-3 py-2.5">
                      <SessionChip session={e.session} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-[var(--color-brand)]">
                      {pctRange(e.implied_move)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[var(--color-muted)]">
                      {pctRange(e.hist_avg_move)}
                    </td>
                    <td className="px-3 py-2.5">
                      <VerdictChip verdict={e.verdict} />
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Link
                        href={`/t/${e.ticker}/`}
                        className="font-semibold text-[var(--color-brand)] hover:underline"
                        aria-label={`Open ${e.ticker}`}
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Support row: recent signals · macro · news. The three tiles share
            one height (the news tile's, which carries pagination); the
            signal and macro rows grow to fill it rather than leaving a gap
            at the bottom. */}
        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-3">
          <Panel
            title="Recent signals"
            className="flex flex-col"
            bodyClassName="flex-1 px-3 py-3"
            action={
              <Link href="/signals/" className={PANEL_ACTION_CLASS}>
                All signals <span aria-hidden>→</span>
              </Link>
            }
            empty={signals.rows.length === 0 ? "No signals recorded yet." : undefined}
          >
            <ul className="flex h-full flex-col gap-1.5">
              {signals.rows
                .filter((row) => record.direction_earned || row.workflow !== "B")
                .slice(0, 6)
                .map((row) => (
                  <li
                    key={`${row.ticker}-${row.run_date}-${row.workflow}`}
                    className="flex flex-1"
                  >
                    <Link
                      href={`/t/${row.ticker}/`}
                      className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-3 py-2 transition-colors hover:bg-[var(--color-panel-soft)]"
                    >
                      <span className="w-14 font-mono text-sm font-bold text-[var(--color-heading)]">
                        {row.ticker}
                      </span>
                      <VerdictChip verdict={row.verdict} />
                      {record.direction_earned && <DirectionChip direction={row.direction} />}
                      <span className="tnum ml-auto font-mono text-xs text-[var(--color-muted)]">
                        {formatDateShort(row.run_date)}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </Panel>

          <Panel
            title="Macro calendar"
            className="flex flex-col"
            bodyClassName="flex-1 px-3 py-3"
            action={
              <Link href="/macro-calendar/" className={PANEL_ACTION_CLASS}>
                Full calendar <span aria-hidden>→</span>
              </Link>
            }
            empty={upcomingMacro.length === 0 ? "Nothing scheduled." : undefined}
          >
            <ul className="flex h-full flex-col gap-1.5">
              {upcomingMacro.map((e) => (
                <li
                  key={`${e.type}-${e.date}`}
                  className="flex flex-1 items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-3 py-2"
                >
                  <span className="tnum w-14 shrink-0 font-mono text-sm text-[var(--color-muted)]">
                    {formatDateShort(e.date)}
                  </span>
                  <MacroEventChip type={e.type} />
                  <span className="tnum ml-auto shrink-0 font-mono text-xs text-[var(--color-brand)]">
                    {relativeDaysFromDate(e.date)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Recent news"
            className="flex flex-col"
            bodyClassName="flex-1 px-0 pt-3 pb-0"
            action={
              <span className="px-2 py-1 text-xs font-medium text-[var(--color-muted)]">
                Updated nightly
              </span>
            }
            empty={news.items.length === 0 ? "No recent headlines." : undefined}
          >
            <NewsFeed items={news.items} />
          </Panel>
        </div>
      </div>
    </>
  );
}

function Pill({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "rich" }) {
  const cls =
    tone === "rich"
      ? "border-[var(--color-verdict-rich)]/35 bg-[var(--color-verdict-rich-bg)] text-[var(--color-verdict-rich)]"
      : "border-[var(--color-brand)]/40 bg-[var(--color-brand)]/10 text-[var(--color-brand)]";
  return (
    <span
      className={`shrink-0 rounded-[4px] border px-2 py-0.5 font-mono text-xs font-medium whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  );
}

function DashKpi({
  label,
  icon,
  value,
  valueClass = "text-[var(--color-heading)]",
  badge,
  sub,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  valueClass?: string;
  badge?: ReactNode;
  sub: ReactNode;
}) {
  return (
    <Card className="flex flex-col px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-medium tracking-[0.12em] text-[var(--color-muted)] uppercase">
          {label}
        </span>
        <span className="text-[var(--color-brand)]">{icon}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className={`tnum font-mono text-3xl font-bold tracking-tight ${valueClass}`}>
          {value}
        </span>
        {badge}
      </div>
      <div className="mt-2 text-sm text-[var(--color-muted)]">{sub}</div>
    </Card>
  );
}

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function CalendarIcon() {
  return (
    <IconFrame>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </IconFrame>
  );
}

function TrendIcon() {
  return (
    <IconFrame>
      <path d="M2 11l3.5-3.5 2.5 2.5L14 4" />
      <path d="M10.5 4H14v3.5" />
    </IconFrame>
  );
}

function BarsIcon() {
  return (
    <IconFrame>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M5.5 11V8.5M8 11V6M10.5 11V7.5" />
    </IconFrame>
  );
}

function CheckIcon() {
  return (
    <IconFrame>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5.8 8.2l1.6 1.6 3-3.2" />
    </IconFrame>
  );
}
