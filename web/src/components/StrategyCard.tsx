import { Panel } from "@/components/Panel";
import {
  MIN_MOVES_FOR_BACKTEST,
  type PastMove,
  backtestImpliedMove,
  backtestRelevance,
} from "@/lib/backtest";
import { pct } from "@/lib/format";
import { type Verdict, recommendStrategy } from "@/lib/strategy";

/**
 * The structure this setup suggests — the layer above the verdict and
 * direction chips, which each state one fact but leave "so what do I
 * actually do with that" to the reader.
 *
 * Deliberately shows the STRUCTURE only, not strikes: strike selection
 * needs a live chain (a metered call), and this panel renders for every
 * ticker from data the nightly snapshot already carries. The Simulator
 * below is where a reader goes to price actual legs.
 *
 * The disclaimer is not boilerplate here. Naming a specific structure
 * reads as more prescriptive than "the flow leans bullish", so the framing
 * has to work harder to stay on the right side of informational —
 * hence "traders in this setup often use", not "you should".
 */

const BIAS_STYLE: Record<string, string> = {
  bullish:
    "border-[var(--color-direction-bullish)]/25 bg-[var(--color-verdict-cheap-bg)] text-[var(--color-direction-bullish)]",
  bearish:
    "border-[var(--color-direction-bearish)]/25 bg-[var(--color-verdict-rich-bg)] text-[var(--color-direction-bearish)]",
  neutral:
    "border-[var(--color-border)] bg-[var(--color-verdict-fair-bg)] text-[var(--color-direction-neutral)]",
};

const PREMIUM_LABEL: Record<string, string> = {
  sell: "Net credit",
  buy: "Net debit",
  none: "",
};

export function StrategyCard({
  verdict,
  ivInverted,
  pastMoves = [],
  impliedMove,
}: {
  verdict: string | null | undefined;
  ivInverted: boolean | null | undefined;
  /** Realized move per past print, for scoring the suggestion against
   * this stock's own history. */
  pastMoves?: PastMove[];
  impliedMove?: number | null;
}) {
  // Direction-free: the structure follows from the volatility read alone.
  // The directional lean is shown separately (see the direction chip and the
  // track record's directional panel); it no longer picks the structure,
  // because it scored below a coin flip over its first 46 scored calls.
  const suggestion = recommendStrategy({
    verdict: (verdict ?? null) as Verdict | null,
    ivInverted,
  });

  if (suggestion.type === "none") {
    return (
      <Panel
        title="Structure"
        subtitle="What kind of trade this setup lends itself to"
        empty={suggestion.rationale}
      />
    );
  }

  return (
    <Panel
      title="Structure"
      subtitle="What kind of trade this setup lends itself to. Not a recommendation to place one."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-[var(--radius-chip)] border px-2.5 py-1 font-mono text-sm font-medium tracking-[0.06em] uppercase ${
            BIAS_STYLE[suggestion.bias]
          }`}
        >
          {suggestion.label}
        </span>
        {PREMIUM_LABEL[suggestion.premium] && (
          <span className="eyebrow text-[var(--color-muted)]">
            {PREMIUM_LABEL[suggestion.premium]}
          </span>
        )}
        <span className="eyebrow text-[var(--color-muted)]">Defined risk</span>
      </div>

      <p className="mt-4 text-[var(--color-body)]">{suggestion.rationale}</p>

      <Backtest
        strategyType={suggestion.type}
        pastMoves={pastMoves}
        impliedMove={impliedMove}
      />

      <p className="mt-4 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
        A structure traders in this setup often use, derived from the volatility verdict above.
        Not advice, and not sized for anyone&rsquo;s account. Strikes depend on the live chain;
        use the simulator to price actual legs.
      </p>
    </Panel>
  );
}

/**
 * Scores the suggestion against this stock's own past prints. Shown only
 * where the test actually speaks to the structure — a directional spread's
 * outcome depends on which way the stock went, which this doesn't measure,
 * so it stays silent rather than posting an irrelevant number.
 *
 * The exact question is stated inline every time. "6 of 8" invites being
 * read as a win rate for the trade; it isn't one, and the sentence has to
 * carry that or the number will get quoted without it.
 */
function Backtest({
  strategyType,
  pastMoves,
  impliedMove,
}: {
  strategyType: string;
  pastMoves: PastMove[];
  impliedMove: number | null | undefined;
}) {
  const relevance = backtestRelevance(strategyType);
  if (relevance === "n/a") return null;

  const result = backtestImpliedMove(pastMoves, impliedMove);

  if (!result) {
    return (
      <p className="mt-4 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
        Not enough scored history to check this against past prints. It needs at least{" "}
        {MIN_MOVES_FOR_BACKTEST}.
      </p>
    );
  }

  // The count that matters is the one the structure needs to win.
  const favourable = relevance === "wants_within" ? result.within : result.breached;
  const supports = favourable / result.total >= 0.5;

  return (
    <div className="mt-4 border-t border-[var(--color-border-subtle)] pt-4">
      <p className="eyebrow mb-2 text-[var(--color-muted)]">Against past prints</p>
      <p className="text-[var(--color-body)]">
        Over the last {result.total} reports, this stock moved{" "}
        {relevance === "wants_within" ? "less" : "more"} than the currently-implied{" "}
        <strong className="font-medium text-[var(--color-heading)]">
          {pct(impliedMove, 1)}
        </strong>{" "}
        in{" "}
        <strong
          className={`font-medium ${
            supports ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]"
          }`}
        >
          {favourable} of {result.total}
        </strong>
        . The largest was {pct(result.largestMove, 1)}.
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        A move-size check against today&rsquo;s implied move, not a P&amp;L backtest. It
        doesn&rsquo;t model what the options cost at the time, where strikes sat, or when a
        position would have been closed.
      </p>
    </div>
  );
}
