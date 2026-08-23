import { Panel, StatCard } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex, getTrackRecord } from "@/lib/api";
import { pct } from "@/lib/format";

export const metadata = { title: "Track record | PrintEarnings" };

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
              Average long-straddle proxy P&amp;L across scored events, RICH and CHEAP blended
              with no sign correction (as if every call had bought a straddle, which is not
              what either verdict actually recommends):{" "}
              <span className="tnum font-medium text-[var(--color-heading)]">
                {pct(record.avg_long_straddle_pnl)}
              </span>
              . See the recommended-structure edge below for the sign-corrected read.
            </p>
          )}
        </Panel>

        <Panel
          title="Recommended-structure edge"
          subtitle="Sign-corrected for the structure each verdict actually recommends: selling premium on RICH, buying it on CHEAP"
        >
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <StatCard label="RICH calls scored" value={String(record.rich_edge_scored)} />
            <StatCard
              label="RICH edge"
              value={record.rich_edge === null ? "Not enough data" : pct(record.rich_edge)}
              tone={record.rich_edge === null ? "muted" : "default"}
              hint="Selling premium on a RICH call wins when the realized move stays under implied, i.e. the straddle-proxy pnl negative, sign-flipped here so a win reads positive. Withheld below four scored RICH calls."
            />
            <StatCard label="CHEAP calls scored" value={String(record.cheap_edge_scored)} />
            <StatCard
              label="CHEAP edge"
              value={record.cheap_edge === null ? "Not enough data" : pct(record.cheap_edge)}
              tone={record.cheap_edge === null ? "muted" : "default"}
              hint="Buying premium on a CHEAP call wins when the realized move beats implied, i.e. the straddle-proxy pnl as-is. Withheld below four scored CHEAP calls."
            />
          </dl>

          <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
            Kept split by verdict rather than blended into one number, same reason verdict and
            direction accuracy stay on separate axes above: CHEAP has scored a fraction of
            RICH&apos;s sample size so far, and blending the two would let CHEAP borrow RICH&apos;s
            statistical significance.
          </p>
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
