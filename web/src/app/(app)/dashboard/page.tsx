import Link from "next/link";

import { DirectionChip, MacroEventChip, SessionChip, VerdictChip } from "@/components/Chip";
import { ImpliedMoveTrend, type TrendPoint } from "@/components/ImpliedMoveTrend";
import { NewsFeed } from "@/components/NewsFeed";
import { Panel, StatCard } from "@/components/Panel";
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
  EMPTY,
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
 * The overview: what's coming, the read on it, and how the calls have landed.
 * Leads with the implied-move trend and this week's verdict mix, then the
 * names reporting soon, then calmer support tiles.
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

  // The clearest rich/cheap edges this week, strongest first — the "look at
  // these" shortlist a trade-and-go reader wants, next to the trend chart.
  const topSetups = [...entries]
    .filter(
      (e) =>
        (e.verdict === "RICH" || e.verdict === "CHEAP") && typeof e.edge_score === "number",
    )
    .sort((a, b) => (b.edge_score ?? 0) - (a.edge_score ?? 0))
    .slice(0, 5);

  const richCount = entries.filter((e) => e.verdict === "RICH").length;

  const trend = buildTrend(past.rows);
  const latestTrend = trend.length > 0 ? trend[trend.length - 1].value : null;

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
          <StatCard
            label="Reporting this week"
            value={String(entries.length)}
            hint="Tracked companies with a scheduled print in the window."
          />
          <StatCard
            label="Avg implied move"
            value={pctRange(avgImplied)}
            hint="Across upcoming events with pricing available."
          />
          <StatCard
            label="Rich verdicts"
            value={String(richCount)}
            tone={richCount > 0 ? "rich" : "muted"}
            hint="Options pricing a bigger move than typical for the stock."
          />
          <StatCard
            label="Verdict accuracy"
            value={record.accuracy === null ? EMPTY : pct(record.accuracy, 0)}
            tone={record.accuracy === null ? "muted" : "default"}
            hint={`${record.correct} of ${record.scored} rich/cheap calls borne out.`}
          />
        </div>

        {/* Hero: implied-move trend + verdict mix. items-stretch keeps the two
            cards the same height; each card fills that height from the inside
            (chart centered, setup rows distributed) so neither ends with a
            lopsided gap. */}
        <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-3">
          {/* Chart tile carries a soft accent-gradient ground (both themes,
              via color-mix with the panel) rather than a flat white card. */}
          <div
            className="flex flex-col rounded-[var(--radius-panel)] xl:col-span-2"
            style={{
              background: "var(--gradient-tile-strong)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4 pb-1">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-panel-title)]">
                Implied move
              </h2>
              <span className="text-sm text-[var(--color-muted)]">
                avg across weekly reporters, last 8 weeks
              </span>
              {latestTrend !== null && (
                <span className="tnum ml-auto text-xl font-semibold text-[var(--color-heading)]">
                  {pctRange(latestTrend)}
                </span>
              )}
            </div>
            <div className="flex flex-1 items-center px-3 pb-3">
              <ImpliedMoveTrend points={trend} />
            </div>
          </div>

          <div
            className="flex flex-col rounded-[var(--radius-panel)]"
            style={{ background: "var(--gradient-tile)", boxShadow: "var(--shadow-card)" }}
          >
            <div className="border-b border-[var(--color-border-subtle)] px-5 py-4">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--color-panel-title)]">
                Top setups this week
              </h2>
              <p className="mt-1 text-sm text-[var(--color-brand-muted)]">
                Where the vol read sees the clearest edge
              </p>
            </div>
            {topSetups.length === 0 ? (
              <p className="flex-1 px-5 py-8 text-sm text-[var(--color-muted)]">
                No edged setups priced yet this week.
              </p>
            ) : (
              <ul className="flex flex-1 flex-col">
                {topSetups.map((e) => (
                  <li
                    key={`${e.ticker}-${e.report_date}`}
                    className="flex flex-1 border-b border-[var(--color-border-subtle)] last:border-b-0"
                  >
                    <Link
                      href={`/t/${e.ticker}/`}
                      className="flex w-full items-center gap-3 px-5 py-3 hover:bg-[var(--color-panel-soft)]"
                    >
                      <span className="w-12 font-mono text-sm font-semibold text-[var(--color-heading)]">
                        {e.ticker}
                      </span>
                      {e.verdict && <VerdictChip verdict={e.verdict} />}
                      <span className="ml-auto flex flex-col items-end">
                        <span className="tnum text-sm font-medium text-[var(--color-heading)]">
                          {pctRange(e.implied_move)}
                        </span>
                        <span className="text-2xs text-[var(--color-muted)]">
                          vs {pctRange(e.hist_avg_move)} typical
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Reporting soon — the act-on-it surface */}
        <Panel
          title="Reporting soon"
          subtitle={`${entries.length} in the next ${calendar.window_days} days — pick one and go`}
          action={
            <Link href="/calendar/" className={PANEL_ACTION_CLASS}>
              Full calendar <span aria-hidden>→</span>
            </Link>
          }
          empty={entries.length === 0 ? "Nothing scheduled in the window." : undefined}
        >
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {reporters.map((e) => (
              <li key={`${e.ticker}-${e.report_date}`}>
                <Link
                  href={`/t/${e.ticker}/`}
                  className="flex h-full flex-col gap-2 rounded-[var(--radius-md)] bg-[var(--color-panel-soft)] p-3.5 transition-colors hover:bg-[var(--color-border-subtle)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-[var(--color-heading)]">
                      {e.ticker}
                    </span>
                    {e.verdict && <VerdictChip verdict={e.verdict} />}
                  </div>
                  <div>
                    <div className="tnum text-xl font-semibold text-[var(--color-heading)]">
                      {pctRange(e.implied_move)}
                    </div>
                    <div className="text-2xs text-[var(--color-muted)]">implied move</div>
                  </div>
                  <div className="text-2xs mt-auto flex items-center gap-1.5 text-[var(--color-muted)]">
                    {relativeDays(e.days_until)}
                    <SessionChip session={e.session} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Support row: recent signals · macro · news */}
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          <Panel
            title="Recent signals"
            bodyClassName="px-0 py-0"
            action={
              <Link href="/signals/" className={PANEL_ACTION_CLASS}>
                All signals <span aria-hidden>→</span>
              </Link>
            }
            empty={signals.rows.length === 0 ? "No signals recorded yet." : undefined}
          >
            <ul>
              {signals.rows.slice(0, 6).map((row) => (
                <li
                  key={`${row.ticker}-${row.run_date}-${row.workflow}`}
                  className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                >
                  <Link
                    href={`/t/${row.ticker}/`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-panel-soft)]"
                  >
                    <span className="w-14 font-mono text-sm font-medium text-[var(--color-heading)]">
                      {row.ticker}
                    </span>
                    <VerdictChip verdict={row.verdict} />
                    <DirectionChip direction={row.direction} />
                    <span className="tnum ml-auto text-sm text-[var(--color-muted)]">
                      {formatDateShort(row.run_date)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Macro calendar"
            bodyClassName="px-0 py-0"
            action={
              <Link href="/macro-calendar/" className={PANEL_ACTION_CLASS}>
                Full calendar <span aria-hidden>→</span>
              </Link>
            }
            empty={upcomingMacro.length === 0 ? "Nothing scheduled." : undefined}
          >
            <ul>
              {upcomingMacro.map((e) => (
                <li
                  key={`${e.type}-${e.date}`}
                  className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] px-5 py-3 last:border-b-0"
                >
                  <span className="tnum w-14 shrink-0 text-sm font-medium text-[var(--color-heading)]">
                    {formatDateShort(e.date)}
                  </span>
                  <MacroEventChip type={e.type} />
                  <span className="tnum ml-auto shrink-0 text-sm text-[var(--color-muted)]">
                    {relativeDaysFromDate(e.date)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Recent news"
            bodyClassName="px-0 py-0"
            empty={news.items.length === 0 ? "No recent headlines." : undefined}
          >
            <NewsFeed items={news.items} />
          </Panel>
        </div>
      </div>
    </>
  );
}
