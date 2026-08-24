import { Panel, StatCard } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex, getTrackRecord } from "@/lib/api";
import { pct } from "@/lib/format";
import type { TrackRecordPage as TrackRecordData } from "@/lib/types";

export const metadata = { title: "Track record | PrintEarnings" };

/**
 * Turns the raw scored counts into one sentence a first-time visitor can
 * read without knowing what a risk reversal is. Every branch degrades to
 * "not enough data" rather than a partial sentence built on a null — a
 * half-formed claim reads worse than an honest "too early to say."
 */
function summarize(record: TrackRecordData): string {
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

  return (
    <>
      <TopBar title="Track record" eyebrow="Scored against reality" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <Panel title="The bottom line" subtitle="In plain terms">
          <div className="space-y-3">
            <p className="display text-xl">{summarize(record)}</p>
            <p className="text-[var(--color-body)]">
              When the options market looks like it&rsquo;s charging more than usual for a
              stock&rsquo;s expected move into earnings, this site calls that{" "}
              <strong>RICH</strong> and suggests selling that premium (a defined-risk spread,
              never a naked position) instead of buying it outright. When pricing looks
              unusually low, that&rsquo;s <strong>CHEAP</strong>, and the suggestion flips to
              buying.
            </p>
            {(record.rich_edge !== null || record.cheap_edge !== null) && (
              <p className="text-[var(--color-body)]">
                So far,{" "}
                {record.rich_edge !== null && (
                  <>
                    selling into RICH calls has averaged{" "}
                    <span className="tnum font-medium text-[var(--color-heading)]">
                      {pct(record.rich_edge)}
                    </span>{" "}
                    per trade across {record.rich_edge_scored} scored calls
                  </>
                )}
                {record.rich_edge !== null && record.cheap_edge !== null && ", and "}
                {record.cheap_edge !== null && (
                  <>
                    buying into CHEAP calls has averaged{" "}
                    <span className="tnum font-medium text-[var(--color-heading)]">
                      {pct(record.cheap_edge)}
                    </span>{" "}
                    per trade across {record.cheap_edge_scored} scored calls
                  </>
                )}
                . That&rsquo;s the average outcome of the actual recommended trade, not a raw
                price-move number.
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

        <Panel
          title="Was the pricing call right?"
          subtitle='How often "this move is overpriced" or "underpriced" actually held up'
        >
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
        </Panel>

        <Panel
          title="What following that call would have earned"
          subtitle="RICH's and CHEAP's edge, kept separate rather than blended into one number"
        >
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
                had bought a straddle outright, which isn&apos;t what either verdict
                recommends):{" "}
                <span className="tnum font-medium text-[var(--color-heading)]">
                  {pct(record.avg_long_straddle_pnl)}
                </span>
                .
              </>
            )}
          </p>
        </Panel>

        <Panel
          title="Did the up-or-down lean call it right?"
          subtitle="Independent of the pricing call above"
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
              hint="Withheld below four scored calls. 50% is a coin flip."
            />
          </dl>
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
