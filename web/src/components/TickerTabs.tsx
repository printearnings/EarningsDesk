"use client";

import { useState } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { DirectionChip, SessionChip, VerdictChip } from "@/components/Chip";
import { FinancialsPanel } from "@/components/FinancialsPanel";
import { ImpliedVsRealized } from "@/components/ImpliedVsRealized";
import { InsidersPanel } from "@/components/InsidersPanel";
import { NewsThumbnail } from "@/components/NewsThumbnail";
import { OpenInterestChart } from "@/components/OpenInterestChart";
import { Panel, Stat } from "@/components/Panel";
import { PriceChart } from "@/components/PriceChart";
import type { PricePoint, TickerPage as TickerData } from "@/lib/api";
import {
  EMPTY,
  compact,
  eps,
  formatDate,
  formatDateShort,
  money,
  num,
  pct,
  pctRange,
  pctRaw,
  pctSigned,
  ratio,
  sentimentLabel,
} from "@/lib/format";

type TabId = "price" | "options" | "news" | "history" | "financials" | "insiders";

const TABS: { id: TabId; label: string }[] = [
  { id: "price", label: "Price" },
  { id: "options", label: "Options" },
  { id: "news", label: "News" },
  { id: "history", label: "History" },
  { id: "financials", label: "Financials" },
  { id: "insiders", label: "Insiders" },
];

/**
 * The five heavy panels below the fold, as tabs instead of a long stack — a
 * trader checking one thing (what's the setup pricing? what's the news?)
 * shouldn't have to scroll past four panels they don't need this visit.
 *
 * Each tab lazy-mounts on first visit and then stays mounted (hidden via CSS,
 * not unmounted) so switching back doesn't re-fetch financials or lose a
 * chart's pan/zoom position — only the tabs actually opened this visit ever
 * render.
 */
export function TickerTabs({ data }: { data: TickerData }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The tab lives in the URL, not just component state, so a page refresh
  // (or a shared link) lands back on the tab you were reading instead of
  // always resetting to Price.
  const requestedTab = searchParams.get("tab");
  const initialTab: TabId = TABS.some((t) => t.id === requestedTab)
    ? (requestedTab as TabId)
    : "price";

  const [active, setActive] = useState<TabId>(initialTab);
  const [visited, setVisited] = useState<Set<TabId>>(new Set([initialTab]));

  function selectTab(id: TabId) {
    setActive(id);
    if (!visited.has(id)) setVisited(new Set(visited).add(id));
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      {/* A bordered segmented control, not underlined text — the same shape
          as the Range/Line-Candles/Quarterly-Annual toggles this page already
          uses, so it reads unambiguously as "a control that switches views"
          rather than as another row of nav links (which is exactly what the
          plain-text underline version it replaced could be mistaken for). */}
      <div className="overflow-x-auto">
        <div
          className="inline-flex gap-0.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] p-0.5"
          role="tablist"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active === t.id}
              onClick={() => selectTab(t.id)}
              className={`pressable relative shrink-0 rounded-[3px] px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active === t.id
                  ? "text-[var(--color-heading)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-body)]"
              }`}
            >
              {active === t.id && (
                <motion.div
                  layoutId="ticker-tab-pill"
                  className="absolute inset-0 rounded-[3px] bg-[var(--color-panel-soft)]"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-6">
        {visited.has("price") && (
          <div hidden={active !== "price"}>
            <Panel subtitle="Daily and intraday prices. Earnings dates marked on the 1Y view.">
              <PriceChart prices={data.prices} events={data.history} ticker={data.ticker} />
            </Panel>
          </div>
        )}

        {visited.has("options") && (
          <div hidden={active !== "options"}>
            <OptionsPanelCard data={data} />
          </div>
        )}

        {visited.has("news") && (
          <div hidden={active !== "news"}>
            <NewsPanel data={data} />
          </div>
        )}

        {visited.has("history") && (
          <div hidden={active !== "history"} className="space-y-6">
            <Panel
              title="Implied vs realized"
              subtitle="What options priced in each quarter, against what the stock did"
            >
              <ImpliedVsRealized rows={data.history} />
            </Panel>
            <HistoryTable data={data} />
          </div>
        )}

        {visited.has("financials") && (
          <div hidden={active !== "financials"}>
            <FinancialsPanel ticker={data.ticker} />
          </div>
        )}

        {visited.has("insiders") && (
          <div hidden={active !== "insiders"}>
            <InsidersPanel ticker={data.ticker} />
          </div>
        )}
      </div>
    </div>
  );
}

function OptionsPanelCard({ data }: { data: TickerData }) {
  const o = data.options;

  if (!o) {
    return (
      <Panel
        empty={
          // `as_of` only gets set once a snapshot exists — a symbol that's
          // never been captured hasn't been checked for a chain at all,
          // which reads very differently from "checked, found none."
          data.as_of
            ? "No listed options chain for this symbol. No implied move to report."
            : "Options data not yet captured for this symbol."
        }
      />
    );
  }

  const tone = o.verdict === "RICH" ? "rich" : o.verdict === "CHEAP" ? "cheap" : "default";

  return (
    <Panel
      subtitle={
        typeof o.richness === "number"
          ? `${pct(Math.abs(o.richness), 0)} ${
              o.richness > 0 ? "above" : "below"
            } this stock's typical post-earnings move`
          : undefined
      }
      action={
        <Link
          href={`/t/${data.ticker}/simulator/`}
          className="pressable inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-2 text-sm font-semibold whitespace-nowrap text-[var(--color-on-brand)] transition-opacity hover:opacity-90"
          style={{ background: "var(--gradient-brand)" }}
        >
          Simulate a trade →
        </Link>
      }
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Stat
          label="Edge score"
          value={num(o.edge_score, 1)}
          tone={tone}
          hint="0-10. Distance from the historical average."
        />
        <Stat
          label="ATM open interest"
          value={compact(o.atm_open_interest)}
          hint="Contracts at the at-the-money strike. Low = wide spreads."
        />
        <Stat
          label="Call volume"
          value={compact(o.call_volume)}
          hint="Call contracts traded today, all strikes and expiries."
        />
        <Stat
          label="Put volume"
          value={compact(o.put_volume)}
          hint="Put contracts traded today, all strikes and expiries."
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
          hint="Inverted: near-dated options cost more than later ones. The earnings premium."
        />
        <Stat
          label="Front IV"
          value={pct(o.iv_front)}
          hint="Implied volatility, nearest expiry."
        />
        <Stat
          label="Back IV"
          value={pct(o.iv_back)}
          hint="Implied volatility, next expiry out."
        />
        <Stat
          label="Verdict"
          value={o.verdict ?? EMPTY}
          tone={tone}
          hint="Premium versus this stock's own history: rich, cheap, or fair."
        />
      </dl>

      {o.atm_strike && o.atm_expiry && (
        <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
          Measured from the {money(o.atm_strike, 0)} straddle expiring{" "}
          {formatDateShort(o.atm_expiry)}.
        </p>
      )}

      {o.oi_by_strike && o.oi_by_strike.length > 0 && (
        <div className="mt-5 border-t border-[var(--color-border-subtle)] pt-5">
          <p className="eyebrow mb-3">Open interest by strike</p>
          <OpenInterestChart rows={o.oi_by_strike} atmStrike={o.atm_strike} />
        </div>
      )}
    </Panel>
  );
}

function NewsPanel({ data }: { data: TickerData }) {
  if (data.news === null || data.news === undefined) {
    return <Panel empty="Could not load headlines for this symbol on the last update." />;
  }

  return (
    <Panel
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

// The 1Y price series only covers the trailing year, so an older report date
// has no real "day after" close in range at all. Without a bound, the
// closeXAfter functions below would fall through to the *first* point in the
// whole array — some price months away — and silently mislabel it as the
// reaction close. A trading-week-ish cap turns that into an honest "—".
const MAX_REACTION_GAP_DAYS = 7;

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

/** Last close on or before `iso`, within a short window — `prices` must be ascending by date. */
function closeAtOrBefore(prices: PricePoint[], iso: string): number | null {
  let result: PricePoint | null = null;
  for (const p of prices) {
    if (p.date > iso) break;
    result = p;
  }
  return result && daysBetween(result.date, iso) <= MAX_REACTION_GAP_DAYS ? result.close : null;
}

/** First close on or after `iso`, within a short window. */
function closeAtOrAfter(prices: PricePoint[], iso: string): number | null {
  for (const p of prices) {
    if (p.date >= iso) {
      return daysBetween(p.date, iso) <= MAX_REACTION_GAP_DAYS ? p.close : null;
    }
  }
  return null;
}

/** Strictly before `iso`, within a short window — excludes an exact match, unlike closeAtOrBefore. */
function closeStrictlyBefore(prices: PricePoint[], iso: string): number | null {
  let result: PricePoint | null = null;
  for (const p of prices) {
    if (p.date >= iso) break;
    result = p;
  }
  return result && daysBetween(result.date, iso) <= MAX_REACTION_GAP_DAYS ? result.close : null;
}

/** Strictly after `iso`, within a short window — excludes an exact match, unlike closeAtOrAfter. */
function closeStrictlyAfter(prices: PricePoint[], iso: string): number | null {
  for (const p of prices) {
    if (p.date > iso) {
      return daysBetween(p.date, iso) <= MAX_REACTION_GAP_DAYS ? p.close : null;
    }
  }
  return null;
}

/**
 * The close right before and right after a report, timed against when the
 * market actually had the news: an AMC report drops after that day's own
 * close, so the reaction lands in the NEXT session — "before" is the report
 * day's own close, "after" is the next one out. A BMO report is already
 * priced in by the time that day's own close prints, so "before" is the
 * PRIOR day's close and "after" is the report day's own. Unknown session
 * falls back to the AMC convention, the more common case in this data.
 */
function reportPriceWindow(
  prices: PricePoint[],
  reportDate: string,
  session: string | null | undefined,
): { before: number | null; after: number | null } {
  if (session === "BMO") {
    return {
      before: closeStrictlyBefore(prices, reportDate),
      after: closeAtOrAfter(prices, reportDate),
    };
  }
  return {
    before: closeAtOrBefore(prices, reportDate),
    after: closeStrictlyAfter(prices, reportDate),
  };
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
      subtitle="The last eight reports: EPS, surprise, and the move against what was priced in"
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
            hint="Share of rich/cheap calls borne out. Withheld below four scored reports."
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
                "Price before",
                "Price after",
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
              const { before, after } = reportPriceWindow(
                data.prices,
                r.report_date,
                r.session,
              );
              return (
                <tr
                  key={r.report_date}
                  className={`border-b border-[var(--color-border-subtle)] last:border-b-0 ${
                    upcoming ? "bg-[var(--color-panel-soft)]" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2 text-[var(--color-heading)]">
                      {formatDate(r.report_date)}
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
                  <td className="px-3 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                    {money(before)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                    {money(after)}
                  </td>
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
