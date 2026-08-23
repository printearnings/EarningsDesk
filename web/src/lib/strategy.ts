/**
 * Options-strategy suggestion: which structure fits this ticker's earnings
 * setup, and which actual strikes on the live chain build it.
 *
 * Two separate concerns, two separate functions:
 *
 *   recommendStrategy  — verdict × direction (× term structure) -> a
 *                         strategy TYPE. Pure, no chain needed — the same
 *                         inputs the dashboard's chips already carry, so
 *                         this could run for every tracked ticker for free.
 *
 *   selectStrikes       — a strategy TYPE + a live chain -> actual strikes.
 *                         Needs the metered chain fetch (delta per
 *                         contract), so this only runs where the Simulator
 *                         already pays for one.
 *
 * The core idea isn't new math: it's the same "sell rich vol, buy cheap
 * vol" read the verdict chip already makes, wrapped in the defined-risk
 * structure that expresses it without naked exposure. Every recommendation
 * here is capped-loss by construction — no naked short calls/puts, no short
 * strangle — because this is an informational surface, not a broker, and
 * "here's a structure with unlimited downside" is a materially different
 * claim than "here's a directional lean."
 *
 * No UI wiring yet. This is the decision logic on its own, unit-tested
 * against fabricated chains so the math can be trusted before anything
 * renders it.
 */

export type StrategyType =
  | "iron_condor"
  | "bull_put_spread"
  | "bear_call_spread"
  | "long_straddle"
  | "long_strangle"
  | "long_call"
  | "long_put"
  | "call_debit_spread"
  | "put_debit_spread"
  | "calendar_call"
  | "calendar_put"
  | "none";

export type Verdict = "RICH" | "CHEAP" | "FAIR";
export type Direction = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface StrategySuggestion {
  type: StrategyType;
  label: string;
  /** Which side of the trade this leans, independent of premium direction —
   * a bull put spread is "sell premium" AND "bullish" at once. */
  bias: "bullish" | "bearish" | "neutral";
  premium: "sell" | "buy" | "none";
  rationale: string;
}

const NO_EDGE: StrategySuggestion = {
  type: "none",
  label: "No clear structure",
  bias: "neutral",
  premium: "none",
  rationale: "Pricing looks fair and there's no directional lean — nothing here worth structuring a trade around.",
};

/**
 * verdict/direction/ivInverted are exactly the fields `TickerPage` already
 * carries (`options.verdict`, `direction`, `options.iv_inverted`) — this
 * needs no data the app doesn't already compute for every tracked name.
 *
 * `ivInverted` takes priority over the verdict/direction grid: a term
 * structure inverted into earnings (front IV > back IV) is specifically
 * what a calendar spread is built to isolate — the richness is IN the
 * front month, not in the option overall, and a calendar is the one
 * structure here that expresses that distinction rather than just "sell
 * premium somewhere on this expiry."
 */
export function recommendStrategy({
  verdict,
  direction,
  ivInverted,
}: {
  verdict: Verdict | null | undefined;
  direction: Direction | null | undefined;
  ivInverted: boolean | null | undefined;
}): StrategySuggestion {
  if (!verdict) return NO_EDGE;
  const dir = direction ?? "NEUTRAL";

  if (ivInverted && verdict === "RICH") {
    return dir === "BEARISH"
      ? {
          type: "calendar_put",
          label: "Put calendar",
          bias: "bearish",
          premium: "sell",
          rationale:
            "Front-month IV is priced above back-month — the richness is specifically in this expiry, which a calendar isolates instead of a same-expiry spread would.",
        }
      : {
          type: "calendar_call",
          label: "Call calendar",
          bias: dir === "BULLISH" ? "bullish" : "neutral",
          premium: "sell",
          rationale:
            "Front-month IV is priced above back-month — the richness is specifically in this expiry, which a calendar isolates instead of a same-expiry spread would.",
        };
  }

  if (verdict === "RICH") {
    if (dir === "BULLISH") {
      return {
        type: "bull_put_spread",
        label: "Bull put spread",
        bias: "bullish",
        premium: "sell",
        rationale:
          "Implied move is priced above what this stock typically does, and the flow leans bullish — collect the rich premium on the side you'd rather be wrong on.",
      };
    }
    if (dir === "BEARISH") {
      return {
        type: "bear_call_spread",
        label: "Bear call spread",
        bias: "bearish",
        premium: "sell",
        rationale:
          "Implied move is priced above what this stock typically does, and the flow leans bearish — collect the rich premium on the side you'd rather be wrong on.",
      };
    }
    return {
      type: "iron_condor",
      label: "Iron condor",
      bias: "neutral",
      premium: "sell",
      rationale:
        "Implied move is priced above what this stock typically does, with no clear directional lean — a defined-risk condor sells that excess premium on both sides.",
    };
  }

  if (verdict === "CHEAP") {
    if (dir === "BULLISH") {
      return {
        type: "call_debit_spread",
        label: "Call debit spread",
        bias: "bullish",
        premium: "buy",
        rationale:
          "Implied move is priced below what this stock typically does, and the flow leans bullish — a call spread buys the underpriced move at a lower cost than an outright call.",
      };
    }
    if (dir === "BEARISH") {
      return {
        type: "put_debit_spread",
        label: "Put debit spread",
        bias: "bearish",
        premium: "buy",
        rationale:
          "Implied move is priced below what this stock typically does, and the flow leans bearish — a put spread buys the underpriced move at a lower cost than an outright put.",
      };
    }
    return {
      type: "long_straddle",
      label: "Long straddle",
      bias: "neutral",
      premium: "buy",
      rationale:
        "Implied move is priced below what this stock typically does, with no clear lean — a straddle buys that underpriced move in either direction.",
    };
  }

  // FAIR: no mispricing to lean on, so only a real directional view earns a
  // recommendation, and it gets the lower-cost spread rather than a naked
  // long — there's no vol edge here to also pay for.
  if (dir === "BULLISH") {
    return {
      type: "call_debit_spread",
      label: "Call debit spread",
      bias: "bullish",
      premium: "buy",
      rationale:
        "Pricing looks fair, but the flow leans bullish — a debit spread caps cost since there's no volatility mispricing backing the trade.",
    };
  }
  if (dir === "BEARISH") {
    return {
      type: "put_debit_spread",
      label: "Put debit spread",
      bias: "bearish",
      premium: "buy",
      rationale:
        "Pricing looks fair, but the flow leans bearish — a debit spread caps cost since there's no volatility mispricing backing the trade.",
    };
  }
  return NO_EDGE;
}

// ---------------------------------------------------------------------------
// Strike selection
// ---------------------------------------------------------------------------

/** Matches OptionsSimulator's ChainContract shape — duplicated rather than
 * imported so this module has zero dependency on a client component; the
 * two get reconciled into one shared type when this gets wired to a UI. */
export interface ChainContract {
  strike: number;
  expiry: string;
  type: "call" | "put";
  price: number | null;
  iv: number | null;
  delta: number | null;
  open_interest: number | null;
}

export interface StrategyLeg {
  action: "buy" | "sell";
  type: "call" | "put";
  expiry: string;
  /** The delta this leg was chosen to target — 0.16 for a condor's short
   * strike, 0.50 for an ATM straddle leg, etc. Kept alongside the resolved
   * contract so a caller can show "targeting ~16Δ" even when the chain
   * didn't have an exact match. */
  targetDelta: number;
  contract: ChainContract | null;
}

export interface StrategyPlan {
  type: StrategyType;
  legs: StrategyLeg[];
  /** True only when every leg resolved to a real contract — a caller
   * shouldn't build a trade ticket from a partially-resolved plan. */
  complete: boolean;
}

/** Contracts of one type at one expiry, nearest spot first — the shared
 * starting point every selector below filters further. */
function byExpiryAndType(
  contracts: ChainContract[],
  expiry: string,
  type: "call" | "put",
): ChainContract[] {
  return contracts.filter((c) => c.expiry === expiry && c.type === type);
}

/** The contract whose |delta| sits closest to `targetDelta`. Contracts with
 * no delta quoted are skipped rather than treated as a delta-0 match —
 * missing data losing to a real (if imperfect) match is the right default,
 * not missing data winning because it looks like the closest thing to
 * zero. */
function nearestByDelta(contracts: ChainContract[], targetDelta: number): ChainContract | null {
  let best: ChainContract | null = null;
  let bestDiff = Infinity;
  for (const c of contracts) {
    if (c.delta === null) continue;
    const diff = Math.abs(Math.abs(c.delta) - targetDelta);
    if (diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }
  return best;
}

function leg(
  action: "buy" | "sell",
  type: "call" | "put",
  expiry: string,
  targetDelta: number,
  pool: ChainContract[],
): StrategyLeg {
  return { action, type, expiry, targetDelta, contract: nearestByDelta(pool, targetDelta) };
}

/** The next expiry strictly after `frontExpiry`, by calendar order — the
 * back leg of a calendar spread. `contracts` needs to span more than one
 * expiry for this to resolve, same as the Simulator's own chain fetch
 * already returns (the Expiration dropdown's options come from exactly
 * this spread of expiries). */
function nextExpiryAfter(contracts: ChainContract[], frontExpiry: string): string | null {
  const later = [...new Set(contracts.map((c) => c.expiry))]
    .filter((e) => e > frontExpiry)
    .sort();
  return later[0] ?? null;
}

const CONDOR_SHORT_DELTA = 0.16; // ~1 standard deviation OTM
const CONDOR_WING_DELTA = 0.07; // further OTM — caps the condor's risk
const SPREAD_SHORT_DELTA = 0.25;
const SPREAD_LONG_DELTA = 0.1; // credit spread's long (protective) leg
const DEBIT_LONG_DELTA = 0.45; // near-the-money — most of the delta exposure
const DEBIT_SHORT_DELTA = 0.25; // sold further out to reduce cost
const STRANGLE_DELTA = 0.3;
const ATM_DELTA = 0.5;

/**
 * Resolves a strategy type into actual legs against a live chain.
 *
 * `expiry` is the front (or only, for single-expiry strategies) expiry —
 * for the calendar types, the back leg is found automatically from
 * whichever later expiry exists in `contracts`.
 */
export function selectStrikes(
  strategy: StrategyType,
  contracts: ChainContract[],
  expiry: string,
): StrategyPlan {
  const calls = byExpiryAndType(contracts, expiry, "call");
  const puts = byExpiryAndType(contracts, expiry, "put");

  const legs: StrategyLeg[] = ((): StrategyLeg[] => {
    switch (strategy) {
      case "iron_condor":
        return [
          leg("sell", "put", expiry, CONDOR_SHORT_DELTA, puts),
          leg("buy", "put", expiry, CONDOR_WING_DELTA, puts),
          leg("sell", "call", expiry, CONDOR_SHORT_DELTA, calls),
          leg("buy", "call", expiry, CONDOR_WING_DELTA, calls),
        ];
      case "bull_put_spread":
        return [
          leg("sell", "put", expiry, SPREAD_SHORT_DELTA, puts),
          leg("buy", "put", expiry, SPREAD_LONG_DELTA, puts),
        ];
      case "bear_call_spread":
        return [
          leg("sell", "call", expiry, SPREAD_SHORT_DELTA, calls),
          leg("buy", "call", expiry, SPREAD_LONG_DELTA, calls),
        ];
      case "long_straddle":
        return [
          leg("buy", "call", expiry, ATM_DELTA, calls),
          leg("buy", "put", expiry, ATM_DELTA, puts),
        ];
      case "long_strangle":
        return [
          leg("buy", "call", expiry, STRANGLE_DELTA, calls),
          leg("buy", "put", expiry, STRANGLE_DELTA, puts),
        ];
      case "long_call":
        return [leg("buy", "call", expiry, ATM_DELTA, calls)];
      case "long_put":
        return [leg("buy", "put", expiry, ATM_DELTA, puts)];
      case "call_debit_spread":
        return [
          leg("buy", "call", expiry, DEBIT_LONG_DELTA, calls),
          leg("sell", "call", expiry, DEBIT_SHORT_DELTA, calls),
        ];
      case "put_debit_spread":
        return [
          leg("buy", "put", expiry, DEBIT_LONG_DELTA, puts),
          leg("sell", "put", expiry, DEBIT_SHORT_DELTA, puts),
        ];
      case "calendar_call":
      case "calendar_put": {
        const backExpiry = nextExpiryAfter(contracts, expiry);
        if (!backExpiry) return [];
        const type = strategy === "calendar_call" ? "call" : "put";
        const frontPool = byExpiryAndType(contracts, expiry, type);
        const backPool = byExpiryAndType(contracts, backExpiry, type);
        return [
          leg("sell", type, expiry, ATM_DELTA, frontPool),
          leg("buy", type, backExpiry, ATM_DELTA, backPool),
        ];
      }
      case "none":
        return [];
    }
  })();

  return { type: strategy, legs, complete: legs.length > 0 && legs.every((l) => l.contract) };
}
