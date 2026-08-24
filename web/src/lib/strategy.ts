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
  rationale:
    "Options look fairly priced, so there's no volatility edge to structure a trade around. A directional lean alone isn't enough — this site's own directional read hasn't beaten a coin flip, so it doesn't stand in for one.",
};

/**
 * verdict/ivInverted are fields `TickerPage` already carries
 * (`options.verdict`, `options.iv_inverted`) — no data the app doesn't
 * already compute for every tracked name.
 *
 * Direction-free by design. The structure follows from the volatility read
 * alone: RICH sells premium through a neutral condor, CHEAP buys it through
 * a straddle, FAIR is no trade. This used to tilt by a bullish/bearish lean
 * (RICH+bullish -> bull put spread, and so on), but that lean scored 39%
 * over 46 scored calls — below a coin flip, no edge over the base rate, and
 * 84% bullish regardless of outcome. Letting an unvalidated signal pick a
 * directional structure only added directional risk the site couldn't
 * justify. The lean is still shown as an independent read; it no longer
 * decides what to trade. See the track record's directional panel.
 *
 * `ivInverted` still routes RICH to a calendar: front IV > back IV into
 * earnings is a measurable, validated signal, and the calendar is the
 * neutral structure that isolates it — not a guess about direction.
 */
export function recommendStrategy({
  verdict,
  ivInverted,
}: {
  verdict: Verdict | null | undefined;
  ivInverted: boolean | null | undefined;
}): StrategySuggestion {
  if (!verdict) return NO_EDGE;

  if (verdict === "RICH") {
    if (ivInverted) {
      return {
        type: "calendar_call",
        label: "Call calendar",
        bias: "neutral",
        premium: "sell",
        rationale:
          "Front-month IV is priced above back-month, so the richness is specifically in this expiry. A calendar isolates that; a same-expiry spread would not.",
      };
    }
    return {
      type: "iron_condor",
      label: "Iron condor",
      bias: "neutral",
      premium: "sell",
      rationale:
        "Implied move is priced above what this stock typically does. A defined-risk condor sells that excess premium on both sides, with no directional bet.",
    };
  }

  if (verdict === "CHEAP") {
    return {
      type: "long_straddle",
      label: "Long straddle",
      bias: "neutral",
      premium: "buy",
      rationale:
        "Implied move is priced below what this stock typically does. A straddle buys that underpriced move in either direction, with no directional bet.",
    };
  }

  // FAIR: no volatility edge, and the directional lean that used to earn a
  // trade here has no demonstrated edge either. Nothing to act on.
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
 * Skew-aware short-strike placement — the piece skew.py's own docstring
 * calls out as missing: "a structure that ignores skew places its strikes
 * symmetrically around spot even when the market is pricing the two sides
 * very differently."
 *
 * Delta-based selection already normalises for *ordinary* skew (equities
 * carry positive risk reversal essentially always, so a 25-delta put sits
 * further from spot than a 25-delta call as a matter of course — that's
 * priced in, not a signal). This only acts when the risk reversal is large
 * enough to call "unusual" rather than the background level, and then only
 * on the side skew actually flags: when selling premium on the side the
 * market is pricing more tail risk into, stand further off (lower delta,
 * more OTM) than the routine target — the extra distance is the margin of
 * safety a short seller wants specifically where the market itself is
 * saying "this side worries me more."
 */
const SKEW_ELEVATED_THRESHOLD = 0.05; // 5 vol points of risk reversal
const SKEW_SHORT_DELTA_RELIEF = 0.05; // how far off the routine target to back the short strike
const MIN_SHORT_DELTA = 0.05; // floor so relief can't push a strike absurdly far OTM

function skewAdjustedShortDelta(
  side: "put" | "call",
  baseDelta: number,
  riskReversal: number | null | undefined,
): number {
  if (riskReversal === null || riskReversal === undefined) return baseDelta;
  if (Math.abs(riskReversal) < SKEW_ELEVATED_THRESHOLD) return baseDelta;
  // Positive RR = puts bid over calls = downside is the expensive, riskier side.
  const flaggedSide = riskReversal > 0 ? "put" : "call";
  if (side !== flaggedSide) return baseDelta;
  return Math.max(MIN_SHORT_DELTA, baseDelta - SKEW_SHORT_DELTA_RELIEF);
}

/**
 * Resolves a strategy type into actual legs against a live chain.
 *
 * `expiry` is the front (or only, for single-expiry strategies) expiry —
 * for the calendar types, the back leg is found automatically from
 * whichever later expiry exists in `contracts`.
 *
 * `riskReversal` is optional (the standalone Simulator has no snapshot to
 * pull it from) and only nudges the short strike on structures that sell
 * premium — see `skewAdjustedShortDelta`.
 */
export function selectStrikes(
  strategy: StrategyType,
  contracts: ChainContract[],
  expiry: string,
  riskReversal?: number | null,
): StrategyPlan {
  const calls = byExpiryAndType(contracts, expiry, "call");
  const puts = byExpiryAndType(contracts, expiry, "put");

  const legs: StrategyLeg[] = ((): StrategyLeg[] => {
    switch (strategy) {
      case "iron_condor":
        return [
          leg(
            "sell",
            "put",
            expiry,
            skewAdjustedShortDelta("put", CONDOR_SHORT_DELTA, riskReversal),
            puts,
          ),
          leg("buy", "put", expiry, CONDOR_WING_DELTA, puts),
          leg(
            "sell",
            "call",
            expiry,
            skewAdjustedShortDelta("call", CONDOR_SHORT_DELTA, riskReversal),
            calls,
          ),
          leg("buy", "call", expiry, CONDOR_WING_DELTA, calls),
        ];
      case "bull_put_spread":
        return [
          leg(
            "sell",
            "put",
            expiry,
            skewAdjustedShortDelta("put", SPREAD_SHORT_DELTA, riskReversal),
            puts,
          ),
          leg("buy", "put", expiry, SPREAD_LONG_DELTA, puts),
        ];
      case "bear_call_spread":
        return [
          leg(
            "sell",
            "call",
            expiry,
            skewAdjustedShortDelta("call", SPREAD_SHORT_DELTA, riskReversal),
            calls,
          ),
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

  return { type: strategy, legs, complete: isComplete(legs) };
}

/**
 * Every leg resolved to a real and *distinct* contract.
 *
 * Distinctness matters as much as resolution. On a thin chain the nearest
 * contract to 0.16 delta and the nearest to 0.07 can be the same option — a
 * ticker with a single listed put resolves both a condor's short put and its
 * protective wing to that one strike. Every leg is non-null, so checking
 * only for nulls calls the plan complete, but the put spread has zero width:
 * the "protection" IS the short. Its max loss computes to `0 - credit`, i.e.
 * negative, which renders to the reader as a trade that cannot lose.
 *
 * Two legs conflict only when they share an option type AND an expiry AND a
 * strike, which still allows a straddle (same strike, different type) and a
 * calendar (same strike, different expiry).
 */
function isComplete(legs: StrategyLeg[]): boolean {
  if (legs.length === 0 || !legs.every((l) => l.contract)) return false;
  const keys = legs.map((l) => `${l.type}|${l.contract!.expiry}|${l.contract!.strike}`);
  return new Set(keys).size === keys.length;
}

// ---------------------------------------------------------------------------
// Economics
// ---------------------------------------------------------------------------

/** Every US equity option contract's multiplier — mirrors
 * blackScholes.CONTRACT_MULTIPLIER, duplicated so this module stays
 * dependency-free the same way ChainContract is. */
const CONTRACT_MULTIPLIER = 100;

/**
 * A payoff bound is one of three genuinely different things, and
 * collapsing any two of them misstates a real trade:
 *
 *   a number     — the bound, in dollars.
 *   "unbounded"  — no cap exists (a long call's upside).
 *   null         — a cap may well exist, this just can't compute it in
 *                  closed form (a calendar, whose legs expire on different
 *                  dates). Rendering this as "Unlimited" would be a
 *                  materially false claim about the position.
 */
export type PayoffBound = number | "unbounded" | null;

export interface StrategyEconomics {
  /** Positive = the position collects premium (a credit); negative = it
   * pays (a debit). Per one contract of each leg, in dollars. */
  netCredit: number;
  maxProfit: PayoffBound;
  maxLoss: PayoffBound;
  /** Underlying prices where the position breaks even at expiration.
   * Empty when the structure spans expiries (a calendar's value at the
   * front expiry depends on the back leg's remaining time value, which
   * needs a model, not arithmetic). */
  breakevens: number[];
}

/** Widest strike gap between a short and long leg on one side — a vertical
 * spread's risk is the width it can't exceed. */
function verticalWidth(legs: StrategyLeg[], type: "call" | "put"): number | null {
  const side = legs.filter((l) => l.type === type && l.contract);
  if (side.length < 2) return null;
  const strikes = side.map((l) => l.contract!.strike);
  return Math.max(...strikes) - Math.min(...strikes);
}

/**
 * Cost, risk and breakevens for a resolved plan — the numbers that decide
 * whether a structure is worth putting on, which the strategy name alone
 * can't tell you.
 *
 * Returns null for an incomplete plan or any leg missing a price: a
 * partially-priced spread would produce a confident-looking number built
 * on a hole, which is worse than showing nothing.
 *
 * Single-expiry structures only. A calendar's legs expire on different
 * dates, so there is no single expiration payoff to take a max over —
 * `maxProfit`/`maxLoss` stay null rather than pretending otherwise.
 */
export function strategyEconomics(plan: StrategyPlan): StrategyEconomics | null {
  if (!plan.complete || plan.legs.length === 0) return null;
  if (plan.legs.some((l) => l.contract?.price === null || l.contract?.price === undefined)) {
    return null;
  }

  // Selling collects the premium, buying pays it.
  const netCredit =
    plan.legs.reduce(
      (sum, l) => sum + (l.action === "sell" ? l.contract!.price! : -l.contract!.price!),
      0,
    ) * CONTRACT_MULTIPLIER;

  const isCalendar = plan.type === "calendar_call" || plan.type === "calendar_put";
  if (isCalendar) {
    // The debit is real and known; the payoff isn't, for the reason above.
    return { netCredit, maxProfit: null, maxLoss: null, breakevens: [] };
  }

  const putWidth = verticalWidth(plan.legs, "put");
  const callWidth = verticalWidth(plan.legs, "call");
  const perShareCredit = netCredit / CONTRACT_MULTIPLIER;

  switch (plan.type) {
    case "iron_condor": {
      // Only one side can finish in the money, so risk is the wider wing.
      const width = Math.max(putWidth ?? 0, callWidth ?? 0);
      const shortPut = plan.legs.find(
        (l) => l.type === "put" && l.action === "sell",
      )!.contract!;
      const shortCall = plan.legs.find(
        (l) => l.type === "call" && l.action === "sell",
      )!.contract!;
      return {
        netCredit,
        maxProfit: netCredit,
        maxLoss: (width - perShareCredit) * CONTRACT_MULTIPLIER,
        breakevens: [shortPut.strike - perShareCredit, shortCall.strike + perShareCredit],
      };
    }
    case "bull_put_spread":
    case "bear_call_spread": {
      const width = (putWidth ?? callWidth)!;
      const short = plan.legs.find((l) => l.action === "sell")!.contract!;
      const be =
        plan.type === "bull_put_spread"
          ? short.strike - perShareCredit
          : short.strike + perShareCredit;
      return {
        netCredit,
        maxProfit: netCredit,
        maxLoss: (width - perShareCredit) * CONTRACT_MULTIPLIER,
        breakevens: [be],
      };
    }
    case "call_debit_spread":
    case "put_debit_spread": {
      const width = (callWidth ?? putWidth)!;
      const debit = -perShareCredit;
      const long = plan.legs.find((l) => l.action === "buy")!.contract!;
      const be = plan.type === "call_debit_spread" ? long.strike + debit : long.strike - debit;
      return {
        netCredit,
        maxProfit: (width - debit) * CONTRACT_MULTIPLIER,
        maxLoss: -netCredit,
        breakevens: [be],
      };
    }
    case "long_straddle":
    case "long_strangle": {
      const debit = -perShareCredit;
      const call = plan.legs.find((l) => l.type === "call")!.contract!;
      const put = plan.legs.find((l) => l.type === "put")!.contract!;
      return {
        netCredit,
        // Upside on the call side is genuinely uncapped — distinct from
        // "can't compute", which is null.
        maxProfit: "unbounded",
        maxLoss: -netCredit,
        breakevens: [put.strike - debit, call.strike + debit],
      };
    }
    case "long_call":
    case "long_put": {
      const debit = -perShareCredit;
      const c = plan.legs[0].contract!;
      return {
        netCredit,
        // A long put's upside caps at the strike going to zero; a long
        // call's does not cap at all.
        maxProfit:
          plan.type === "long_call" ? "unbounded" : (c.strike - debit) * CONTRACT_MULTIPLIER,
        maxLoss: -netCredit,
        breakevens: [plan.type === "long_call" ? c.strike + debit : c.strike - debit],
      };
    }
    default:
      return { netCredit, maxProfit: null, maxLoss: null, breakevens: [] };
  }
}
