/**
 * How a structure would have fared against this stock's own past prints.
 *
 * The Structure card names a trade; this is what makes that name
 * accountable rather than asserted — the same "scored, not asserted"
 * posture the verdict and direction chips already carry.
 *
 * The test is deliberately narrow and stated in full wherever it renders:
 * it compares TODAY's implied move against each PAST realized move. It is
 * not a P&L backtest. It does not know what the option cost back then, what
 * IV did, or where strikes were — only whether the stock moved further than
 * the market is currently pricing. That single question happens to be the
 * one that decides a short-vol structure, which is why it's worth asking.
 *
 * What it cannot tell you, and must never imply:
 *   - that a condor placed then would have been profitable (strike
 *     placement, credit received and early management all matter)
 *   - anything about a directional structure, whose outcome depends on
 *     which WAY the stock moved, not just how far
 */

/** One past print's realized move, as the wire format carries it. */
export interface PastMove {
  report_date: string;
  /** Signed fraction: -0.06 = down 6%. */
  move: number;
}

export interface BacktestResult {
  /** Prints where |realized| stayed inside the currently-implied move —
   * the winning case for a premium seller. */
  within: number;
  /** Prints that broke through it — the winning case for a premium buyer. */
  breached: number;
  total: number;
  /** Share of prints that stayed within, 0-1. */
  withinRate: number;
  /** The largest absolute move in the sample, for a "worst case" line. */
  largestMove: number;
}

/**
 * Below this many observations the rate is noise dressed as a statistic —
 * 2 of 3 reads as "67%" and would get screenshotted. Mirrors the engine's
 * own MIN_EVENTS_FOR_HIT_RATE rule for exactly the same reason.
 */
export const MIN_MOVES_FOR_BACKTEST = 4;

/**
 * Returns null when there aren't enough past prints to say anything
 * honest — the caller renders a "not enough history" state rather than a
 * confident-looking small-sample number.
 *
 * `impliedMove` is the absolute fraction currently priced in (0.095 for
 * ±9.5%); a non-positive or missing one has nothing to compare against.
 */
export function backtestImpliedMove(
  moves: PastMove[],
  impliedMove: number | null | undefined,
): BacktestResult | null {
  if (typeof impliedMove !== "number" || !Number.isFinite(impliedMove) || impliedMove <= 0) {
    return null;
  }

  const magnitudes = moves.map((m) => Math.abs(m.move)).filter((m) => Number.isFinite(m));

  if (magnitudes.length < MIN_MOVES_FOR_BACKTEST) return null;

  // A move exactly equal to the implied is counted as within: the seller
  // keeps the premium at the breakeven itself. The distinction is
  // vanishingly rare in practice but shouldn't be arbitrary.
  const within = magnitudes.filter((m) => m <= impliedMove).length;

  return {
    within,
    breached: magnitudes.length - within,
    total: magnitudes.length,
    withinRate: within / magnitudes.length,
    largestMove: Math.max(...magnitudes),
  };
}

/**
 * Which side of the test a structure wants to win, so the UI can say
 * whether the history supports or undercuts the suggestion rather than
 * leaving the reader to work out the direction of the argument.
 *
 * A directional structure returns "n/a": this test only measures move
 * SIZE, and a bull put spread's outcome turns on which way the stock
 * went. Reporting a rate for it would answer a question nobody asked
 * with a number that looks like it did.
 */
export function backtestRelevance(
  strategyType: string,
): "wants_within" | "wants_breach" | "n/a" {
  switch (strategyType) {
    case "iron_condor":
      return "wants_within";
    case "long_straddle":
    case "long_strangle":
      return "wants_breach";
    default:
      return "n/a";
  }
}
