import { CheapStoryCallout } from "@/components/CheapStory";
import { Panel, StatCard } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex, getTrackRecord } from "@/lib/api";
import { pct } from "@/lib/format";
import { directionNote } from "@/lib/insights";
import type { TrackRecordPage as TrackRecordData } from "@/lib/types";

export const metadata = { title: "Track record | PrintEarnings" };

/**
 * Turns the raw scored counts into one sentence a first-time visitor can
 * read without knowing what a risk reversal is. Every branch degrades to
 * "not enough data" rather than a partial sentence built on a null — a
 * half-formed claim reads worse than an honest "too early to say."
 *
 * Prefers the real structure result, which priced the actual condor or
 * spread on real option bars and so already includes the spread paid and
 * the post-print IV crush. The per-verdict edges it falls back to only
 * sign-correct a long-straddle proxy.
 *
 * It reports the two halves separately and never their average. Measured
 * over the first 40 priced trades they pointed in opposite directions:
 * short premium won 71% of the time yet averaged -5.2%, long premium won
 * 56% and averaged +28%. Blending those produced a mild positive that
 * described neither and read as a consistently profitable strategy.
 */
function summarize(record: TrackRecordData): string {
  const sell = record.structure_sell_avg_pnl_pct ?? null;
  const buy = record.structure_buy_avg_pnl_pct ?? null;

  // Lead with the split, never the blend. The two halves genuinely point in
  // opposite directions, and one averaged number would claim a consistently
  // profitable strategy that the data does not support.
  if (sell !== null && buy !== null) {
    if (sell <= 0 && buy > 0) {
      return "Buying options when they looked cheap made money. Selling them when they looked expensive did not.";
    }
    if (sell > 0 && buy <= 0) {
      return "Selling options when they looked expensive made money. Buying them when they looked cheap did not.";
    }
    if (sell > 0 && buy > 0) {
      return "Both kinds of call would have made money, traded the way we score them.";
    }
    return "Neither kind of call would have made money, traded the way we score them.";
  }
  if (sell !== null || buy !== null) {
    const only = sell ?? buy!;
    const label = sell !== null ? "Selling expensive options" : "Buying cheap options";
    return `${label} ${only > 0 ? "made" : "lost"} money so far. The other half has too few scored trades to judge.`;
  }

  const rich_edge = record.rich_edge ?? null;
  const cheap_edge = record.cheap_edge ?? null;
  const rich_edge_scored = record.rich_edge_scored ?? 0;
  const cheap_edge_scored = record.cheap_edge_scored ?? 0;
  if (rich_edge === null && cheap_edge === null) {
    return "Not enough scored calls yet to say whether following these calls would have paid off.";
  }
  if (rich_edge !== null && cheap_edge !== null) {
    if (rich_edge > 0 && cheap_edge > 0) {
      return "Following this site's calls has made money on both sides so far.";
    }
    if (rich_edge <= 0 && cheap_edge <= 0) {
      return "Neither side of this site's calls has made money so far.";
    }
    return "One side of this site's calls has made money so far, the other hasn't.";
  }
  // Only one side has scored enough calls yet to say anything.
  const known =
    rich_edge !== null ? { label: "selling into RICH calls", edge: rich_edge } : null;
  const cheapKnown =
    cheap_edge !== null ? { label: "buying into CHEAP calls", edge: cheap_edge } : null;
  const side = known ?? cheapKnown!;
  const otherScored = known ? cheap_edge_scored : rich_edge_scored;
  return `${side.edge > 0 ? "Money so far" : "No edge yet"} on ${side.label} (the only side with enough scored calls to say). The other side has only ${otherScored} scored, too few to call either way.`;
}

export default async function TrackRecordPage() {
  const [index, record] = await Promise.all([getIndex(), getTrackRecord()]);

  const dirAccuracy = record.dir_accuracy ?? null;
  const dirAccuracyBelowChance = dirAccuracy !== null && dirAccuracy < 0.5;
  const sellAvg = record.structure_sell_avg_pnl_pct ?? null;
  const buyAvg = record.structure_buy_avg_pnl_pct ?? null;

  return (
    <>
      <TopBar title="Track record" eyebrow="Scored against reality" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <CheapStoryCallout record={record} showLink={false} />

        <Panel title="The bottom line">
          <div className="space-y-3">
            <p className="display text-xl">{summarize(record)}</p>
            <p className="text-[var(--color-body)]">
              When the options market looks like it&rsquo;s charging more than usual for a
              stock&rsquo;s expected move into earnings, this site calls that{" "}
              <strong>RICH</strong>. To test whether that read is worth anything, every RICH
              call is scored as if the premium had been sold through a defined-risk iron condor
              (never a naked position). When pricing looks unusually low, that&rsquo;s{" "}
              <strong>CHEAP</strong>, scored as if a straddle had been bought. These are tests
              of the read, not trades we&rsquo;re telling anyone to place.
            </p>
            {record.structure_scored > 0 && (
              <p className="text-[var(--color-body)]">
                Across {record.structure_scored} scored trades priced at real option prices, the
                two halves behaved very differently.{" "}
                {sellAvg !== null && (
                  <>
                    Selling expensive options won{" "}
                    <span className="tnum font-medium text-[var(--color-heading)]">
                      {pct(record.structure_sell_win_rate, 0)}
                    </span>{" "}
                    of the time but still averaged{" "}
                    <span
                      className={`tnum font-medium ${sellAvg > 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}
                    >
                      {pct(sellAvg)}
                    </span>
                    , because the occasional loss is far bigger than any single win.{" "}
                  </>
                )}
                {buyAvg !== null && (
                  <>
                    Buying cheap options won only{" "}
                    <span className="tnum font-medium text-[var(--color-heading)]">
                      {pct(record.structure_buy_win_rate, 0)}
                    </span>{" "}
                    of the time yet averaged{" "}
                    <span
                      className={`tnum font-medium ${buyAvg > 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"}`}
                    >
                      {pct(buyAvg)}
                    </span>
                    , because its losses are capped at what you paid while its wins are not.
                  </>
                )}
              </p>
            )}
            <p className="text-[var(--color-body)]">
              Those are what the actual spreads would have paid or cost, including the price
              you&rsquo;d have paid to get in and the collapse in option prices that follows a
              print. A high win rate and a losing average are not a contradiction: it is what
              selling options looks like.
            </p>
            {(record.rich_edge !== null || record.cheap_edge !== null) && (
              <p className="text-[var(--color-body)]">
                On a simpler measure that ignores the specific strikes,{" "}
                {record.rich_edge !== null && (
                  <>
                    selling into RICH calls scores{" "}
                    <span className="tnum font-medium text-[var(--color-heading)]">
                      {pct(record.rich_edge)}
                    </span>{" "}
                    across {record.rich_edge_scored} calls
                  </>
                )}
                {record.rich_edge !== null && record.cheap_edge !== null && ", and "}
                {record.cheap_edge !== null && (
                  <>
                    buying into CHEAP calls scores{" "}
                    <span className="tnum font-medium text-[var(--color-heading)]">
                      {pct(record.cheap_edge)}
                    </span>{" "}
                    across {record.cheap_edge_scored} calls
                  </>
                )}
                .
              </p>
            )}
            <p className="text-[var(--color-body)]">
              Separately, this site sometimes also leans bullish or bearish on a stock
              (independent of the RICH/CHEAP pricing call).{" "}
              {dirAccuracy === null ? (
                "Not enough of those calls are scored yet to report an accuracy."
              ) : dirAccuracyBelowChance ? (
                <>
                  That lean has been right{" "}
                  <span className="tnum font-medium text-[var(--color-negative)]">
                    {pct(dirAccuracy, 0)}
                  </span>{" "}
                  of the time so far ({record.dir_correct} of {record.dir_scored}), worse than a
                  coin flip. Read it with more skepticism than the pricing calls above until
                  more prints are scored.
                </>
              ) : (
                <>
                  That lean has been right{" "}
                  <span className="tnum font-medium text-[var(--color-heading)]">
                    {pct(dirAccuracy, 0)}
                  </span>{" "}
                  of the time so far ({record.dir_correct} of {record.dir_scored}).
                </>
              )}
            </p>
          </div>
        </Panel>

        <Panel title="Was the pricing call right?">
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <StatCard label="Scored events" value={String(record.scored)} />
            <StatCard label="RICH/CHEAP calls" value={String(record.directional)} />
            <StatCard label="Correct" value={String(record.correct)} />
            <StatCard
              label="Accuracy"
              value={record.accuracy === null ? "Not enough data" : pct(record.accuracy, 0)}
              tone={record.accuracy === null ? "muted" : "default"}
              hint="Withheld below four scored calls. A single correct verdict reads as 100%."
            />
          </dl>
          {(record.excluded_far_expiry ?? 0) > 0 && (
            <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
              Counts only calls whose implied move was measured on an option expiring within a
              week of the report. {record.excluded_far_expiry} earlier calls priced off a later
              monthly expiry are left out: that price includes weeks of ordinary volatility, so
              RICH read right almost by construction. Counting them, the figure was{" "}
              {pct(record.all_accuracy, 0)} on {record.all_directional}.
            </p>
          )}
        </Panel>

        <Panel title="What the scored trade would have returned">
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <StatCard
              label="Selling: trades"
              value={String(record.structure_sell_scored)}
              hint="Iron condors (and, in older records, credit spreads): the structures scored on RICH calls."
            />
            <StatCard
              label="Selling: win rate"
              value={
                sellAvg === null ? "Not enough data" : pct(record.structure_sell_win_rate, 0)
              }
              tone={sellAvg === null ? "muted" : "default"}
              hint="Selling premium wins most of the time by design. The win rate alone says little without the average beside it."
            />
            <StatCard
              label="Selling: average"
              value={sellAvg === null ? "Not enough data" : pct(sellAvg)}
              tone={sellAvg === null ? "muted" : "default"}
              hint="Average profit or loss as a share of money put at risk. Can be negative even with a high win rate: the gain is capped at the premium collected while a breach costs multiples of it."
            />
            <StatCard
              label="Selling: worst case"
              value="Capped by design"
              tone="muted"
              hint="Every scored structure is defined-risk, so a loss is bounded by the width of the spread. No naked positions are scored."
            />
            <StatCard
              label="Buying: trades"
              value={String(record.structure_buy_scored)}
              hint="Straddles (and, in older records, debit spreads): the structures scored on CHEAP calls."
            />
            <StatCard
              label="Buying: win rate"
              value={
                buyAvg === null ? "Not enough data" : pct(record.structure_buy_win_rate, 0)
              }
              tone={buyAvg === null ? "muted" : "default"}
              hint="Buying premium loses more often than it wins by design."
            />
            <StatCard
              label="Buying: average"
              value={buyAvg === null ? "Not enough data" : pct(buyAvg)}
              tone={buyAvg === null ? "muted" : "default"}
              hint="Can be positive despite a low win rate: the loss is capped at what you paid, while a large move has no such ceiling."
            />
            <StatCard
              label="Buying: worst case"
              value="The premium paid"
              tone="muted"
              hint="A long option or debit spread cannot lose more than it cost to open."
            />
          </dl>

          <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
            Deliberately not combined into one number. The two sides point in opposite
            directions, so an average of them would describe neither. Only trades whose every
            leg could be priced from real option bars are counted; a call on a thinly traded
            stock whose chain lacked the strikes the structure needs is recorded but left out
            rather than guessed at, so this sample is smaller than the scored-event count above.
          </p>
        </Panel>

        <Panel title="The same question, on a simpler measure">
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <StatCard label="RICH calls scored" value={String(record.rich_edge_scored)} />
            <StatCard
              label="RICH edge"
              value={record.rich_edge === null ? "Not enough data" : pct(record.rich_edge)}
              tone={record.rich_edge === null ? "muted" : "default"}
              hint="Average outcome of selling premium on a RICH call: wins when the stock's actual move stays under what options were pricing in. Withheld below four scored RICH calls."
            />
            <StatCard label="CHEAP calls scored" value={String(record.cheap_edge_scored)} />
            <StatCard
              label="CHEAP edge"
              value={record.cheap_edge === null ? "Not enough data" : pct(record.cheap_edge)}
              tone={record.cheap_edge === null ? "muted" : "default"}
              hint="Average outcome of buying premium on a CHEAP call: wins when the stock's actual move beats what options were pricing in. Withheld below four scored CHEAP calls."
            />
          </dl>

          <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
            Kept separate because CHEAP has scored far fewer calls than RICH so far, and merging
            them would let CHEAP&apos;s thinner sample borrow RICH&apos;s confidence.
            {typeof record.avg_long_straddle_pnl === "number" && (
              <>
                {" "}
                For reference, the unadjusted figure across every scored call (as if every call
                had bought a straddle outright, which isn&apos;t how either verdict is scored):{" "}
                <span className="tnum font-medium text-[var(--color-heading)]">
                  {pct(record.avg_long_straddle_pnl)}
                </span>
                .
              </>
            )}
          </p>
        </Panel>

        <Panel title="Did the up-or-down lean call it right?">
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <StatCard label="Scored reads" value={String(record.dir_scored)} />
            <StatCard label="Correct" value={String(record.dir_correct)} />
            <StatCard
              label="Accuracy"
              value={
                record.dir_accuracy === null ? "Not enough data" : pct(record.dir_accuracy, 0)
              }
              tone={record.dir_accuracy === null ? "muted" : "default"}
              hint="Withheld below four scored calls. 50% is a coin flip."
            />
          </dl>
          {directionNote(record) && (
            <p className="mt-5 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
              {directionNote(record)} Until then it stays off ticker pages and signal lists, and
              Discord posts it as experimental with no named contract. It keeps being scored
              here every day, so it can earn its way back.
            </p>
          )}
        </Panel>

        <p className="max-w-3xl text-sm text-[var(--color-muted)]">
          The pricing call and the directional lean are independent claims. &ldquo;The market
          overpriced this move&rdquo; and &ldquo;the stock went up&rdquo; are not the same bet.
          A correct call on one says nothing about the other, so both are tracked and scored
          separately rather than folded into a single win rate.
        </p>
      </div>
    </>
  );
}
