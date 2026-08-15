import { notFound } from "next/navigation";

import { DirectionChip, SessionChip, VerdictChip } from "@/components/Chip";
import { CompanyLogo } from "@/components/CompanyLogo";
import { FinancialsPanel } from "@/components/FinancialsPanel";
import { ImpliedVsRealized } from "@/components/ImpliedVsRealized";
import { NewsThumbnail } from "@/components/NewsThumbnail";
import { Eyebrow, Panel, Stat, StatCard } from "@/components/Panel";
import { PriceChart } from "@/components/PriceChart";
import { TopBar } from "@/components/TopBar";
import { getIndex, getTicker } from "@/lib/api";
import type { TickerPage as TickerData } from "@/lib/api";
import {
  EMPTY,
  compact,
  eps,
  formatAge,
  formatDate,
  formatDateShort,
  money,
  num,
  pct,
  pctRange,
  pctRaw,
  pctSigned,
  ratio,
  relativeDays,
  sentimentLabel,
  sessionLabel,
} from "@/lib/format";

/** Static export needs the full route list at build time. */
export async function generateStaticParams() {
  const index = await getIndex();
  return index.tickers.map((t) => ({ ticker: t.ticker }));
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} earnings — EarningsDesk` };
}

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const [index, data] = await Promise.all([getIndex(), getTicker(ticker)]);
  if (!data) notFound();

  return (
    <>
      <TopBar
        title={data.ticker}
        eyebrow={data.is_tracked ? "Tracked" : "Cold lookup"}
        tickers={index.tickers}
      />

      <div className="space-y-6 px-6 py-6">
        <SubHeader data={data} />

        {data.is_stale && (
          <p className="rounded-[var(--radius-sm)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning)]">
            This data is {formatAge(data.snapshot_age_hours)} and may be out of date — the
            nightly update looks to have been missed.
          </p>
        )}

        <KpiRow data={data} />

        {data.ai_summary && <AiPanel data={data} />}

        <Panel
          title="Price"
          subtitle="Past year of daily closes, with each earnings date marked"
        >
          <PriceChart prices={data.prices} events={data.history} ticker={data.ticker} />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <OptionsPanelCard data={data} />
          <NewsPanel data={data} />
        </div>

        <Panel
          title="Implied vs realized"
          subtitle="What options priced in each quarter, against what the stock actually did"
        >
          <ImpliedVsRealized rows={data.history} />
        </Panel>

        <HistoryTable data={data} />

        <FinancialsPanel ticker={data.ticker} />
      </div>
    </>
  );
}

function SubHeader({ data }: { data: TickerData }) {
  const session = sessionLabel(data.next_report_session);

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        {data.company_name && (
          <div className="mb-1 flex items-center gap-1.5">
            <CompanyLogo ticker={data.ticker} domain={data.company_domain} size={16} />
            <span className="text-sm text-[var(--color-muted)]">{data.company_name}</span>
          </div>
        )}

        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-semibold text-[var(--color-heading)]">
            {money(data.spot)}
          </span>
          {data.options?.verdict && <VerdictChip verdict={data.options.verdict} />}
        </div>

        <p className="mt-2 text-[var(--color-body)]">
          {data.next_report_date ? (
            <>
              Reports{" "}
              <strong className="font-medium text-[var(--color-heading)]">
                {formatDate(data.next_report_date)}
              </strong>
              {session && `, ${session}`} — {relativeDays(data.days_until_report)}
            </>
          ) : (
            "No confirmed earnings date."
          )}
        </p>
      </div>

      <div className="text-right">
        {/* Cached pricing always carries its age. A number without a timestamp
            invites someone to trade on it as if it were live. */}
        <Eyebrow>{data.as_of ? "Last updated" : "No snapshot"}</Eyebrow>
        <p className="mt-1 text-sm text-[var(--color-body)]">
          {data.as_of ? formatAge(data.snapshot_age_hours) : EMPTY}
        </p>
        {!data.is_tracked && (
          <p className="mt-1 text-sm text-[var(--color-warning)]">
            Outside the tracked universe — no signal history
          </p>
        )}
      </div>
    </header>
  );
}

/** Vertical's KPI row: one metric per bordered white card. */
function KpiRow({ data }: { data: TickerData }) {
  const o = data.options;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Implied move"
        value={pctRange(o?.implied_move)}
        tone={o?.verdict === "RICH" ? "rich" : o?.verdict === "CHEAP" ? "cheap" : "default"}
        hint="The move the at-the-money straddle is pricing in for this earnings date."
      />
      <StatCard
        label="Typical move"
        value={pctRange(o?.hist_avg_move)}
        hint="Average absolute move after the last eight earnings reports."
      />
      <StatCard
        label="Put/call ratio"
        value={num(o?.put_call_ratio)}
        hint="Below 1 means more call volume than put volume."
      />
      <StatCard
        label="Days to report"
        value={
          typeof data.days_until_report === "number" ? String(data.days_until_report) : EMPTY
        }
        hint="Calendar days until the next scheduled print."
      />
    </div>
  );
}

function AiPanel({ data }: { data: TickerData }) {
  const s = data.ai_summary!;
  return (
    <Panel
      title="What the numbers say"
      subtitle={
        <>
          Generated from this page&rsquo;s data{s.model ? ` by ${s.model}` : ""}. Describes the
          numbers; does not recommend a trade.
        </>
      }
    >
      <div className="space-y-4">
        <p className="display text-xl">{s.headline}</p>
        <p className="text-[var(--color-body)]">{s.setup}</p>
        <p className="text-[var(--color-body)]">{s.history_read}</p>

        {s.watch_items.length > 0 && (
          <div className="rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-panel-soft)] px-4 py-3">
            <Eyebrow>Worth watching</Eyebrow>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--color-body)]">
              {s.watch_items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="eyebrow">Confidence: {s.confidence}</p>
      </div>
    </Panel>
  );
}

function OptionsPanelCard({ data }: { data: TickerData }) {
  const o = data.options;

  if (!o) {
    return (
      <Panel
        title="Options"
        empty="No listed options chain for this symbol, so there's no implied move to report."
      />
    );
  }

  const tone = o.verdict === "RICH" ? "rich" : o.verdict === "CHEAP" ? "cheap" : "default";

  return (
    <Panel
      title="What options are pricing"
      subtitle={
        typeof o.richness === "number"
          ? `${pct(Math.abs(o.richness), 0)} ${
              o.richness > 0 ? "above" : "below"
            } this stock's typical post-earnings move`
          : undefined
      }
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Stat
          label="Edge score"
          value={num(o.edge_score, 1)}
          tone={tone}
          hint="0-10. How far implied has diverged from the historical average."
        />
        <Stat
          label="ATM open interest"
          value={compact(o.atm_open_interest)}
          hint="Contracts held at the at-the-money strike. Low numbers mean wide spreads."
        />
        <Stat
          label="IV term"
          value={
            o.iv_inverted === null || o.iv_inverted === undefined
              ? EMPTY
              : o.iv_inverted
                ? "Inverted"
                : "Normal"
          }
          tone={o.iv_inverted ? "rich" : "default"}
          hint="Inverted means near-dated options cost more than later ones — the earnings premium."
        />
        <Stat
          label="Front IV"
          value={pct(o.iv_front)}
          hint="Implied volatility on the nearest expiry."
        />
        <Stat
          label="Back IV"
          value={pct(o.iv_back)}
          hint="Implied volatility on the next expiry out."
        />
        <Stat
          label="Verdict"
          value={o.verdict ?? EMPTY}
          tone={tone}
          hint="Whether the premium looks rich, cheap, or fair versus this stock's own history."
        />
      </dl>

      {o.atm_strike && o.atm_expiry && (
        <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
          Measured from the {money(o.atm_strike, 0)} straddle expiring{" "}
          {formatDateShort(o.atm_expiry)}.
        </p>
      )}
    </Panel>
  );
}

function NewsPanel({ data }: { data: TickerData }) {
  if (data.news === null || data.news === undefined) {
    return (
      <Panel title="News" empty="Couldn't load headlines for this symbol on the last update." />
    );
  }

  return (
    <Panel
      title="Recent news"
      subtitle={
        typeof data.news_sentiment === "number"
          ? `Overall tone: ${sentimentLabel(data.news_sentiment).toLowerCase()}`
          : undefined
      }
      empty={data.news.length === 0 ? "No recent headlines." : undefined}
    >
      <ul className="space-y-3">
        {data.news.map((item) => (
          <li
            key={item.url ?? item.title}
            className="flex gap-3 border-b border-[var(--color-border-subtle)] pb-3 last:border-b-0 last:pb-0"
          >
            {item.thumbnail_url && <NewsThumbnail src={item.thumbnail_url} alt="" />}
            <div className="min-w-0">
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
              {item.publisher && (
                <span className="text-2xs mt-0.5 block text-[var(--color-muted)]">
                  {item.publisher}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {typeof data.analyst_rating_raw === "number" && (
        <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
          Analyst rating {num(data.analyst_rating_raw, 1)} / 5
        </p>
      )}
    </Panel>
  );
}

function HistoryTable({ data }: { data: TickerData }) {
  const rows = data.history;
  const stats = data.stats;
  // Baked at build time. The site regenerates nightly, so at worst this is a
  // few hours stale — and the only thing it drives is whether an EPS cell
  // reads "pending" or an em dash.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Panel
      title="Earnings history"
      subtitle="The last eight reports"
      bodyClassName="px-0 py-0"
      empty={
        rows.length === 0 ? "No earnings history recorded for this symbol yet." : undefined
      }
    >
      {stats && (
        <dl className="grid grid-cols-2 gap-5 border-b border-[var(--color-border)] px-5 py-5 sm:grid-cols-4">
          <Stat
            label="Reports scored"
            value={String(stats.n_events)}
            hint="Events with both a signal and a scored outcome."
          />
          <Stat
            label="Hit rate"
            value={stats.hit_rate === null ? "Not enough data" : pct(stats.hit_rate, 0)}
            tone={stats.hit_rate === null ? "muted" : "default"}
            /* Withheld below four scored calls: one correct verdict reads as
               100% accuracy, and that number would get screenshotted. */
            hint="Share of rich/cheap calls that were borne out. Withheld below four scored reports."
          />
          <Stat
            label="Avg implied"
            value={pctRange(stats.avg_implied_move)}
            hint="What options typically priced in."
          />
          <Stat
            label="Avg realized"
            value={pctRange(stats.avg_realized_move)}
            hint="What the stock typically did."
          />
        </dl>
      )}

      <div className="overflow-x-auto">
        <table className="tnum w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] text-left">
              {[
                "Date",
                "EPS est",
                "EPS actual",
                "Surprise",
                "Implied",
                "Actual",
                "Gap",
                "Volume",
                "Call",
              ].map((h) => (
                <th key={h} className="eyebrow px-3 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // "Upcoming" is a fact about the calendar, not about our data
              // coverage. Deriving it from `realized_move` (as an earlier cut
              // did) mislabels every past quarter as pending whenever the
              // engine hasn't scored that ticker's outcomes yet — which is the
              // common case today.
              const upcoming = r.report_date >= today;
              return (
                <tr
                  key={r.report_date}
                  className={`border-b border-[var(--color-border-subtle)] last:border-b-0 ${
                    upcoming ? "bg-[var(--color-panel-soft)]" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2 text-[var(--color-heading)]">
                      {formatDateShort(r.report_date)}
                      <SessionChip session={r.session} />
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{eps(r.eps_estimate)}</td>
                  <td className="px-3 py-2.5">
                    {upcoming && r.eps_actual === null ? (
                      <span className="text-[var(--color-muted)]">pending</span>
                    ) : (
                      eps(r.eps_actual)
                    )}
                  </td>
                  <td
                    className={`px-3 py-2.5 ${
                      typeof r.eps_surprise === "number"
                        ? r.eps_surprise >= 0
                          ? "text-[var(--color-positive)]"
                          : "text-[var(--color-negative)]"
                        : ""
                    }`}
                  >
                    {pctRaw(r.eps_surprise)}
                  </td>
                  <td className="px-3 py-2.5">{pctRange(r.implied_move)}</td>
                  <td className="px-3 py-2.5">{pctSigned(r.realized_move)}</td>
                  <td className="px-3 py-2.5">
                    {pctSigned(r.gap_open_pct)}
                    {r.gap_filled === true && (
                      <span className="ml-1.5 font-mono tracking-[0.06em] text-[var(--color-muted)] text-[var(--text-2xs)] uppercase">
                        filled
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{ratio(r.vol_ratio, 1)}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex gap-1.5">
                      <VerdictChip verdict={r.verdict} />
                      <DirectionChip direction={r.direction} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
