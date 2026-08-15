import Link from "next/link";

import { DirectionChip, SessionChip, VerdictChip } from "@/components/Chip";
import { CompanyLogo } from "@/components/CompanyLogo";
import { NewsThumbnail } from "@/components/NewsThumbnail";
import { Panel, StatCard } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getCalendar, getDashboardNews, getIndex, getSignals, getTrackRecord } from "@/lib/api";
import {
  formatDateShort,
  pct,
  pctRange,
  relativeDays,
  relativeDaysFromDate,
} from "@/lib/format";

export const metadata = { title: "Dashboard — EarningsDesk" };

/**
 * The overview: what's coming, what the engine has said lately, and how those
 * calls have actually worked out. Everything here is a summary that links to a
 * fuller page — this is the "where do I go next" surface, not a place to read
 * detail.
 */
export default async function DashboardPage() {
  const [index, calendar, signals, record, news] = await Promise.all([
    getIndex(),
    getCalendar(14),
    getSignals(),
    getTrackRecord(),
    getDashboardNews(),
  ]);

  const priced = calendar.entries.filter((e) => typeof e.implied_move === "number");
  const rich = calendar.entries.filter((e) => e.verdict === "RICH").length;
  const avgImplied =
    priced.length > 0
      ? priced.reduce((sum, e) => sum + (e.implied_move ?? 0), 0) / priced.length
      : null;

  return (
    <>
      <TopBar title="Dashboard" eyebrow="Overview" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Reporting in 14 days"
            value={String(calendar.entries.length)}
            hint="Tracked companies with a scheduled print in the window."
          />
          <StatCard
            label="Avg implied move"
            value={pctRange(avgImplied)}
            hint="Across the upcoming events we currently have pricing for."
          />
          <StatCard
            label="Rich verdicts"
            value={String(rich)}
            tone={rich > 0 ? "rich" : "muted"}
            hint="Options pricing a bigger move than the stock typically makes."
          />
          <StatCard
            label="Calls scored"
            value={String(record.scored)}
            hint="Signals checked against what actually happened."
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel
            title="Next to report"
            subtitle={`${calendar.entries.length} in the next ${calendar.window_days} days`}
            bodyClassName="px-0 py-0"
            action={
              <Link
                href="/calendar/"
                className="text-sm text-[var(--color-body)] underline-offset-4 hover:underline"
              >
                Full calendar
              </Link>
            }
            empty={
              calendar.entries.length === 0 ? "Nothing scheduled in the window." : undefined
            }
          >
            <ul>
              {calendar.entries.slice(0, 8).map((entry) => (
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
          </Panel>

          <div className="space-y-6">
            <Panel
              title="Track record"
              subtitle="Every call, scored against what happened"
              action={
                <Link
                  href="/track-record/"
                  className="text-sm text-[var(--color-body)] underline-offset-4 hover:underline"
                >
                  Detail
                </Link>
              }
            >
              <dl className="grid grid-cols-2 gap-5">
                <StatCard
                  label="Verdict accuracy"
                  /* Withheld below four scored calls — one correct verdict
                     reads as 100%, and that number gets screenshotted. */
                  value={record.accuracy === null ? "Not enough data" : pct(record.accuracy, 0)}
                  tone={record.accuracy === null ? "muted" : "default"}
                  hint={`${record.correct} of ${record.directional} rich/cheap calls borne out.`}
                />
                <StatCard
                  label="Direction accuracy"
                  value={
                    record.dir_accuracy === null
                      ? "Not enough data"
                      : pct(record.dir_accuracy, 0)
                  }
                  tone={record.dir_accuracy === null ? "muted" : "default"}
                  hint={`${record.dir_correct} of ${record.dir_scored} directional reads correct.`}
                />
              </dl>

              <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
                Verdict and direction are separate claims — &ldquo;the market overpriced this
                move&rdquo; and &ldquo;the stock went up&rdquo; are not the same bet, so they
                are scored apart.
              </p>
            </Panel>

            <Panel
              title="Recent signals"
              bodyClassName="px-0 py-0"
              action={
                <Link
                  href="/signals/"
                  className="text-sm text-[var(--color-body)] underline-offset-4 hover:underline"
                >
                  All signals
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
          </div>
        </div>

        <Panel
          title="Recent news"
          subtitle="Latest headlines across the tracked universe"
          bodyClassName="px-0 py-0"
          empty={news.items.length === 0 ? "No recent headlines." : undefined}
        >
          <ul>
            {news.items.slice(0, 10).map((item) => (
              <li
                key={item.url ?? `${item.ticker}-${item.title}`}
                className="border-b border-[var(--color-border-subtle)] px-5 py-3 last:border-b-0"
              >
                <div className="flex gap-3">
                  {item.thumbnail_url && <NewsThumbnail src={item.thumbnail_url} alt="" />}
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-1.5">
                      <CompanyLogo
                        ticker={item.ticker}
                        domain={item.company_domain}
                        size={16}
                      />
                      <Link
                        href={`/t/${item.ticker}/`}
                        className="font-mono text-sm font-medium text-[var(--color-heading)] hover:underline"
                      >
                        {item.ticker}
                      </Link>
                    </div>
                    {item.url ? (
                      // Third-party link: no `noopener` would let the destination
                      // page reach back via `window.opener` into this tab.
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--color-body)] underline-offset-4 hover:text-[var(--color-heading)] hover:underline"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <span className="text-sm text-[var(--color-body)]">{item.title}</span>
                    )}
                    <div className="text-2xs mt-0.5 text-[var(--color-muted)]">
                      {[item.publisher, relativeDaysFromDate(item.published_at)]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
