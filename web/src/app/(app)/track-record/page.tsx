import { Panel, StatCard } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex, getTrackRecord } from "@/lib/api";
import { pct } from "@/lib/format";

export const metadata = { title: "Track record | EarningsDesk" };

/**
 * Verdict and direction accuracy, kept on two separate axes throughout — see
 * `Chip.tsx` for why. Hit rates are withheld below four scored calls
 * (`MIN_EVENTS_FOR_HIT_RATE` in the engine): a single correct call reads as
 * 100% accuracy, and that number gets screenshotted.
 */
export default async function TrackRecordPage() {
  const [index, record] = await Promise.all([getIndex(), getTrackRecord()]);

  return (
    <>
      <TopBar title="Track record" eyebrow="Scored against reality" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <Panel title="Vol rich/cheap calls" subtitle="Accuracy of the market-pricing verdict">
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <StatCard label="Scored events" value={String(record.scored)} />
            <StatCard label="Directional calls" value={String(record.directional)} />
            <StatCard label="Correct" value={String(record.correct)} />
            <StatCard
              label="Accuracy"
              value={record.accuracy === null ? "Not enough data" : pct(record.accuracy, 0)}
              tone={record.accuracy === null ? "muted" : "default"}
              hint="Withheld below four scored calls. A single correct verdict reads as 100%."
            />
          </dl>

          {typeof record.avg_long_straddle_pnl === "number" && (
            <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
              Average long-straddle proxy P&amp;L across scored events:{" "}
              <span className="tnum font-medium text-[var(--color-heading)]">
                {pct(record.avg_long_straddle_pnl)}
              </span>
            </p>
          )}
        </Panel>

        <Panel
          title="Directional calls"
          subtitle="Did the bullish/bearish read call the sign right?"
        >
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <StatCard label="Scored reads" value={String(record.dir_scored)} />
            <StatCard label="Correct" value={String(record.dir_correct)} />
            <StatCard
              label="Accuracy"
              value={
                record.dir_accuracy === null ? "Not enough data" : pct(record.dir_accuracy, 0)
              }
              tone={record.dir_accuracy === null ? "muted" : "default"}
              hint="Withheld below four scored calls."
            />
          </dl>
        </Panel>

        <p className="max-w-3xl text-sm text-[var(--color-muted)]">
          Verdict and direction are independent claims. &ldquo;The market overpriced this
          move&rdquo; and &ldquo;the stock went up&rdquo; are not the same bet. A correct call
          on one says nothing about the other, so both are tracked and scored separately rather
          than folded into a single win rate.
        </p>
      </div>
    </>
  );
}
