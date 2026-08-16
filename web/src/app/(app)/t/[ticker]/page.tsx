import { notFound } from "next/navigation";

import { DirectionChip, VerdictChip } from "@/components/Chip";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Eyebrow, Panel, StatCard } from "@/components/Panel";
import { TickerTabs } from "@/components/TickerTabs";
import { TopBar } from "@/components/TopBar";
import { getIndex, getTicker } from "@/lib/api";
import type { TickerPage as TickerData } from "@/lib/api";
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
  return { title: `${ticker.toUpperCase()} earnings | EarningsDesk` };
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
            This data is {formatAge(data.snapshot_age_hours)} and may be out of date. The
            nightly update looks to have been missed.
          </p>
        )}

        <KpiRow data={data} />

        {data.ai_summary && <AiPanel data={data} />}

        <TickerTabs data={data} />
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
          {data.direction && <DirectionChip direction={data.direction} />}
        </div>

        <p className="mt-2 text-[var(--color-body)]">
          {data.next_report_date ? (
            <>
              Reports{" "}
              <strong className="font-medium text-[var(--color-heading)]">
                {formatDate(data.next_report_date)}
              </strong>
              {session && `, ${session}`} · {relativeDays(data.days_until_report)}
            </>
          ) : (
            "No confirmed earnings date."
          )}
        </p>

        {/* The one number this whole feature lives or dies on, so its
            freshness and confidence are never left implicit — same rule as
            the snapshot-age label on the right. */}
        {data.direction ? (
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {typeof data.direction_confidence === "number"
              ? `${pct(data.direction_confidence, 0)} confidence`
              : null}
            {data.direction_as_of && ` · as of ${formatDateShort(data.direction_as_of)}`}
            {" · options flow + sentiment, not a recommendation"}
          </p>
        ) : (
          typeof data.days_until_report === "number" &&
          data.days_until_report >= 0 &&
          data.days_until_report <= DIRECTION_HEADS_UP_DAYS && (
            <p className="mt-1 text-sm text-[var(--color-muted)]">
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
            Outside the tracked universe, no signal history
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
