import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DirectionChip, VerdictChip } from "@/components/Chip";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Eyebrow, Panel, StatCard } from "@/components/Panel";
import { TickerTabs } from "@/components/TickerTabs";
import { TopBar } from "@/components/TopBar";
import { getIndex, getTicker, getTrackRecord } from "@/lib/api";
import type { TickerPage as TickerData, TrackRecordPage } from "@/lib/api";
import {
  EMPTY,
  formatAge,
  formatDate,
  formatDateShort,
  money,
  num,
  pct,
  pctRange,
  relativeDays,
  sessionLabel,
} from "@/lib/format";

// Wider than the engine's own DIRECTION_LOOKAHEAD_DAYS (3) on purpose: a
// reader within this window but before the read exists should see "not yet"
// rather than nothing, so the feature reads as upcoming, not missing.
const DIRECTION_HEADS_UP_DAYS = 7;

/** Static export needs the full route list at build time. */
export async function generateStaticParams() {
  const index = await getIndex();
  return index.tickers.map((t) => ({ ticker: t.ticker }));
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} earnings | PrintEarnings` };
}

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const [index, data, record] = await Promise.all([
    getIndex(),
    getTicker(ticker),
    getTrackRecord(),
  ]);
  if (!data) notFound();

  return (
    <>
      <TopBar
        title={data.ticker}
        eyebrow={data.is_tracked ? "Tracked" : "Cold lookup"}
        tickers={index.tickers}
      />

      <div className="space-y-6 px-6 py-6">
        <SubHeader data={data} record={record} />

        {data.is_stale && (
          <p className="rounded-[var(--radius-sm)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning)]">
            Last updated {formatAge(data.snapshot_age_hours)}, longer than usual for this page.
            Treat the numbers below with extra caution.
          </p>
        )}

        <KpiRow data={data} />

        {data.ai_summary && <AiPanel data={data} />}

        {/* useSearchParams (for the tab-in-URL persistence) requires a
            Suspense boundary during static prerendering. */}
        <Suspense fallback={<p className="text-sm text-[var(--color-muted)]">Loading…</p>}>
          <TickerTabs data={data} />
        </Suspense>
      </div>
    </>
  );
}

function SubHeader({ data, record }: { data: TickerData; record: TrackRecordPage }) {
  const showVerdictRecord = Boolean(data.options?.verdict);
  const showDirectionRecord = Boolean(data.direction);

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
          {data.direction && <DirectionChip direction={data.direction} />}
        </div>

        {/* These were two dot-separated prose lines in muted small text —
            four distinct numbers a reader has to parse a sentence to find.
            As labelled micro-tiles each value is scannable on its own, and
            the label carries the meaning the prose was spending words on. */}
        {(data.direction || showVerdictRecord || showDirectionRecord) && (
          <div className="mt-3 flex flex-wrap items-stretch gap-2">
            {data.direction && typeof data.direction_confidence === "number" && (
              <MicroStat
                label="Confidence"
                value={pct(data.direction_confidence, 0)}
                hint="How strongly the options flow and sentiment agree on this direction."
              />
            )}
            {data.direction && data.direction_as_of && (
              <MicroStat
                label="Read as of"
                value={formatDateShort(data.direction_as_of)}
                hint="When the directional read was last refreshed."
              />
            )}
            {showVerdictRecord && (
              <MicroStat
                label="Verdict calls"
                value={record.accuracy === null ? EMPTY : pct(record.accuracy, 0)}
                sub={record.accuracy === null ? "not enough history" : `${record.correct}/${record.scored} right`}
                hint="How often a rich/cheap call has been right, site-wide."
              />
            )}
            {showDirectionRecord && (
              <MicroStat
                label="Direction calls"
                value={record.dir_accuracy === null ? EMPTY : pct(record.dir_accuracy, 0)}
                sub={
                  record.dir_accuracy === null
                    ? "not enough history"
                    : `${record.dir_correct}/${record.dir_scored} right`
                }
                hint="How often a bullish/bearish call has been right, site-wide."
              />
            )}
          </div>
        )}

        {data.direction ? (
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Options flow + sentiment, not a recommendation ·{" "}
            <Link href="/track-record/" className="underline underline-offset-2">
              Track record
            </Link>
          </p>
        ) : (
          typeof data.days_until_report === "number" &&
          data.days_until_report >= 0 &&
          data.days_until_report <= DIRECTION_HEADS_UP_DAYS && (
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Directional read not available yet. It starts a few days before the report.
            </p>
          )
        )}
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
            Not one of our closely-tracked names, so no signal history
          </p>
        )}
      </div>
    </header>
  );
}

/**
 * A compact bordered tile for the sub-header's credibility numbers —
 * smaller than the KPI row's StatCard, which would overpower the price
 * and verdict chips it sits under. Same visual language (border, panel
 * fill, eyebrow label), one step down in scale.
 */
function MicroStat({
  label,
  value,
  sub,
  hint,
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2"
      title={hint}
    >
      <p className="eyebrow text-[var(--color-muted)]">{label}</p>
      <p className="tnum mt-0.5 text-sm font-semibold text-[var(--color-heading)]">{value}</p>
      {sub && <p className="tnum text-2xs mt-0.5 text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

/** Vertical's KPI row: one metric per bordered white card. */
function KpiRow({ data }: { data: TickerData }) {
  const o = data.options;
  const session = sessionLabel(data.next_report_session);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Next report"
        value={data.next_report_date ? formatDate(data.next_report_date) : EMPTY}
        hint="The next scheduled earnings date."
        delta={
          <span className="text-[var(--color-muted)]">
            {data.next_report_date
              ? `${session ? `${session} · ` : ""}${relativeDays(data.days_until_report)}`
              : "No confirmed earnings date"}
          </span>
        }
      />
      <StatCard
        label="Implied move"
        value={pctRange(o?.implied_move)}
        tone={o?.verdict === "RICH" ? "rich" : o?.verdict === "CHEAP" ? "cheap" : "default"}
        hint="At-the-money straddle price for this earnings date."
      />
      <StatCard
        label="Typical move"
        value={pctRange(o?.hist_avg_move)}
        hint="Average absolute move, last eight earnings reports."
      />
      <StatCard
        label="Put/call ratio"
        value={num(o?.put_call_ratio)}
        hint="Below 1: more call volume than put volume."
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
