import Link from "next/link";
import { notFound } from "next/navigation";

import { DirectionChip, VerdictChip } from "@/components/Chip";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Eyebrow, Panel } from "@/components/Panel";
import { TickerTabs } from "@/components/TickerTabs";
import { Card, pricedMultiple } from "@/components/TickerOverview";
import { getIndex, getTicker, getTrackRecord } from "@/lib/api";
import type { TickerPage as TickerData, TrackRecordPage } from "@/lib/api";
import { formatAge, formatDateShort, money, pct } from "@/lib/format";

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
  const [data, record] = await Promise.all([getTicker(ticker), getTrackRecord()]);
  if (!data) notFound();

  return (
    <>
      <h1 className="sr-only">
        {data.ticker}
        {data.company_name ? `, ${data.company_name}` : ""} earnings
      </h1>

      <div className="space-y-6 px-6 py-6">
        <TickerHeader data={data} record={record} />

        {data.is_stale && (
          <p className="rounded-[var(--radius-sm)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] px-4 py-3 text-sm text-[var(--color-warning)]">
            Last updated {formatAge(data.snapshot_age_hours)}, longer than usual for this page.
            Treat the numbers below with extra caution.
          </p>
        )}

        {/* The AI read is a top-level summary of the whole ticker, so it sits
            with the identity above the tabs — persistent across every tab. The
            earnings-setup KPIs, price chart, and company snapshot now live in
            the Overview tab; peers moved to their own tab. */}
        {data.ai_summary && <AiPanel data={data} />}

        {/* No Suspense boundary: TickerTabs reads ?tab= without
            useSearchParams, so the Overview is in the static HTML. */}
        <TickerTabs data={data} showDirection={record.direction_earned} />
      </div>
    </>
  );
}

/**
 * The identity strip at the top of the page: who this is and what options are
 * pricing, on one card. The ticker is in mono brand color, the price sits
 * beside the verdict, and the site-wide record for each kind of call sits
 * right under the claim, so the claim is never shown without its record.
 */
function TickerHeader({ data, record }: { data: TickerData; record: TrackRecordPage }) {
  const verdict = data.options?.verdict ?? null;
  const multiple = pricedMultiple(data);
  const verdictAccuracy = typeof record.accuracy === "number" ? record.accuracy : null;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5 px-5 py-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-3">
          <CompanyLogo ticker={data.ticker} domain={data.company_domain} size={28} />
          <span className="font-mono text-3xl font-bold tracking-tight text-[var(--color-brand)]">
            {data.ticker}
          </span>
        </div>
        {data.company_name && (
          <span className="max-w-56 text-sm leading-snug font-semibold text-[var(--color-heading)]">
            {data.company_name}
          </span>
        )}
        <span className="hidden h-8 w-px bg-[var(--color-border)] sm:block" aria-hidden />
        <div className="flex flex-wrap items-center gap-2">
          <HeaderChip>{data.is_tracked ? "Tracked" : "Cold lookup"}</HeaderChip>
          {data.as_of && (
            <HeaderChip tone={data.is_stale ? "warning" : "muted"}>
              Updated {formatAge(data.snapshot_age_hours)}
            </HeaderChip>
          )}
        </div>
      </div>

      <div className="flex flex-col items-start gap-2.5 sm:items-end">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="tnum font-mono text-3xl font-bold text-[var(--color-heading)]">
            {money(data.spot)}
          </span>
          <VerdictChip verdict={verdict} />
          {data.direction && record.direction_earned && (
            <DirectionChip direction={data.direction} />
          )}
          {multiple !== null && verdict && (
            <span
              className="hidden items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 font-mono text-xs text-[var(--color-body)] md:inline-flex"
              title="Implied move divided by this stock's typical post-earnings move"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  verdict === "RICH"
                    ? "bg-[var(--color-verdict-rich)]"
                    : verdict === "CHEAP"
                      ? "bg-[var(--color-verdict-cheap)]"
                      : "bg-[var(--color-verdict-fair)]"
                }`}
                aria-hidden
              />
              Priced {multiple.toFixed(1)}× its typical move
            </span>
          )}
        </div>

        {verdict && (
          <Link
            href="/track-record/"
            className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-heading)]"
            title="How often a rich/cheap call has been right, site-wide. Misses included."
          >
            <span className="tracking-[0.06em] uppercase">Rich/cheap calls</span>
            {verdictAccuracy === null ? (
              <span>not enough history</span>
            ) : (
              <>
                <span className="font-semibold text-[var(--color-heading)]">
                  {pct(verdictAccuracy, 0)}
                </span>
                <span>
                  ({record.correct}/{record.directional})
                </span>
                <span className="h-1 w-16 overflow-hidden rounded-full bg-[var(--color-panel-soft)]">
                  <span
                    className="block h-full rounded-full bg-[var(--color-brand)]"
                    style={{ width: `${verdictAccuracy * 100}%` }}
                  />
                </span>
              </>
            )}
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>

      <DirectionNote data={data} record={record} />
    </Card>
  );
}

/**
 * The directional lean is a separate, weaker claim than the pricing call. Its
 * site-wide accuracy goes right next to it, including when that accuracy is
 * below a coin flip.
 */
function DirectionNote({ data, record }: { data: TickerData; record: TrackRecordPage }) {
  // Below the gate the lean isn't shown at all, so there's nothing to hedge
  // here. The track record page says why and keeps scoring it.
  if (data.direction && !record.direction_earned) {
    return null;
  }
  if (data.direction) {
    return (
      <p className="w-full border-t border-[var(--color-border-subtle)] pt-3 text-sm text-[var(--color-muted)]">
        Leans{" "}
        <span className="font-medium text-[var(--color-heading)]">
          {data.direction.toLowerCase()}
        </span>
        {typeof data.direction_confidence === "number" &&
          ` at ${pct(data.direction_confidence, 0)} confidence`}
        {data.direction_as_of && ` (as of ${formatDateShort(data.direction_as_of)})`}. Options
        flow and sentiment, not a recommendation.
        {typeof record.dir_accuracy === "number" &&
          ` The lean has been right ${pct(record.dir_accuracy, 0)} of the time site-wide (${record.dir_correct}/${record.dir_scored}).`}{" "}
        <Link href="/track-record/" className="underline underline-offset-2">
          Track record
        </Link>
      </p>
    );
  }
  if (
    record.direction_earned &&
    typeof data.days_until_report === "number" &&
    data.days_until_report >= 0 &&
    data.days_until_report <= DIRECTION_HEADS_UP_DAYS
  ) {
    return (
      <p className="w-full border-t border-[var(--color-border-subtle)] pt-3 text-sm text-[var(--color-muted)]">
        Directional read not available yet. It starts a few days before the report.
      </p>
    );
  }
  if (!data.is_tracked) {
    return (
      <p className="w-full border-t border-[var(--color-border-subtle)] pt-3 text-sm text-[var(--color-warning)]">
        Not one of our closely-tracked names, so no signal history.
      </p>
    );
  }
  return null;
}

function HeaderChip({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "warning";
}) {
  return (
    <span
      className={`rounded-[4px] border px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase ${
        tone === "warning"
          ? "border-[var(--color-warning)]/40 text-[var(--color-warning)]"
          : "border-[var(--color-border)] text-[var(--color-muted)]"
      }`}
    >
      {children}
    </span>
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
