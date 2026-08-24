import { describe, expect, it } from "vitest";

import {
  type ChainContract,
  recommendStrategy,
  selectStrikes,
  strategyEconomics,
} from "./strategy";

// ---------------------------------------------------------------------------
// recommendStrategy — the decision matrix
// ---------------------------------------------------------------------------

describe("recommendStrategy", () => {
  it("has no recommendation without a verdict", () => {
    expect(recommendStrategy({ verdict: null, ivInverted: false }).type).toBe("none");
  });

  // The structure follows from the volatility verdict alone. The directional
  // lean was removed after scoring 39% over its first 46 calls — below a coin
  // flip — so a bullish/bearish read no longer picks a directional spread.
  describe("RICH -> a neutral, defined-risk short-premium structure", () => {
    it("sells an iron condor", () => {
      const s = recommendStrategy({ verdict: "RICH", ivInverted: false });
      expect(s.type).toBe("iron_condor");
      expect(s.premium).toBe("sell");
      expect(s.bias).toBe("neutral");
    });

    it("routes to a calendar when the term structure is inverted", () => {
      const s = recommendStrategy({ verdict: "RICH", ivInverted: true });
      expect(s.type).toBe("calendar_call");
      expect(s.bias).toBe("neutral");
    });
  });

  describe("CHEAP -> a neutral long-premium structure", () => {
    it("buys a straddle regardless of term structure", () => {
      expect(recommendStrategy({ verdict: "CHEAP", ivInverted: false }).type).toBe(
        "long_straddle",
      );
      expect(recommendStrategy({ verdict: "CHEAP", ivInverted: true }).type).toBe(
        "long_straddle",
      );
    });
  });

  describe("FAIR -> no trade", () => {
    it("recommends nothing, because the only edge it could have leaned on was directional", () => {
      expect(recommendStrategy({ verdict: "FAIR", ivInverted: false }).type).toBe("none");
      expect(recommendStrategy({ verdict: "FAIR", ivInverted: true }).type).toBe("none");
    });
  });

  it("never suggests anything but a neutral bias now that direction is gone", () => {
    for (const verdict of ["RICH", "CHEAP", "FAIR"] as const) {
      for (const ivInverted of [true, false]) {
        expect(recommendStrategy({ verdict, ivInverted }).bias).toBe("neutral");
      }
    }
  });

  it("never recommends a naked short (undefined-risk) structure", () => {
    const UNDEFINED_RISK = new Set(["short_strangle", "naked_call", "naked_put"]);
    for (const verdict of ["RICH", "CHEAP", "FAIR"] as const) {
      for (const ivInverted of [true, false]) {
        const { type } = recommendStrategy({ verdict, ivInverted });
        expect(UNDEFINED_RISK.has(type)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// selectStrikes — resolving a strategy against a live chain
// ---------------------------------------------------------------------------

const EXPIRY = "2026-08-28";
const BACK_EXPIRY = "2026-09-04";

/** A strike ladder with plausible deltas either side of spot — calls lose
 * delta as strike rises, puts gain magnitude as strike falls, same shape a
 * real chain has. Dense enough that every target delta this module uses
 * (0.07 through 0.50) has a close real match. `step` controls strike
 * spacing; the delta-per-step scales with it so the overall curve slope
 * stays the same regardless — a finer step just resolves more precisely,
 * which the skew tests below need to reliably land on a different strike
 * for a 0.05 delta-target shift. */
function fabricateChain(expiry: string, spot: number, step = 2.5): ChainContract[] {
  const contracts: ChainContract[] = [];
  const deltaPerStep = 0.055 * (step / 2.5);
  for (let i = -12 * (2.5 / step); i <= 12 * (2.5 / step); i++) {
    const strike = spot + i * step;
    // Rough delta curve: 0.50 ATM, decaying ~0.05 per $2.5 step away from spot.
    const callDelta = Math.max(0.02, Math.min(0.98, 0.5 - i * deltaPerStep));
    const putDelta = -Math.max(0.02, Math.min(0.98, 0.5 + i * deltaPerStep));
    contracts.push({
      strike,
      expiry,
      type: "call",
      price: 1,
      iv: 0.5,
      delta: callDelta,
      open_interest: 100,
    });
    contracts.push({
      strike,
      expiry,
      type: "put",
      price: 1,
      iv: 0.5,
      delta: putDelta,
      open_interest: 100,
    });
  }
  return contracts;
}

const SPOT = 100;
const CHAIN = [...fabricateChain(EXPIRY, SPOT), ...fabricateChain(BACK_EXPIRY, SPOT)];
// A finer strike ladder for the skew tests, which need a 0.05 delta-target
// shift to reliably resolve to a different strike than the coarse $2.5
// ladder above always guarantees.
const FINE_CHAIN = fabricateChain(EXPIRY, SPOT, 0.5);

describe("selectStrikes", () => {
  it("iron condor resolves 4 legs: short/long put below spot, short/long call above", () => {
    const plan = selectStrikes("iron_condor", CHAIN, EXPIRY);
    expect(plan.complete).toBe(true);
    expect(plan.legs).toHaveLength(4);

    const [shortPut, longPut, shortCall, longCall] = plan.legs;
    expect(shortPut).toMatchObject({ action: "sell", type: "put" });
    expect(longPut).toMatchObject({ action: "buy", type: "put" });
    expect(shortCall).toMatchObject({ action: "sell", type: "call" });
    expect(longCall).toMatchObject({ action: "buy", type: "call" });

    // The condor's wings must sit further from spot than its short strikes
    // — a wing inside the short strike isn't a wing, it's a broken condor.
    expect(longPut.contract!.strike).toBeLessThan(shortPut.contract!.strike);
    expect(longCall.contract!.strike).toBeGreaterThan(shortCall.contract!.strike);
    // And puts below spot, calls above — a condor that's flipped sides
    // would be a completely different (and wrong) risk profile.
    expect(shortPut.contract!.strike).toBeLessThan(SPOT);
    expect(shortCall.contract!.strike).toBeGreaterThan(SPOT);
  });

  it("bull put spread: short strike closer to spot than the long (protective) strike", () => {
    const plan = selectStrikes("bull_put_spread", CHAIN, EXPIRY);
    expect(plan.complete).toBe(true);
    const [short, long] = plan.legs;
    expect(short.action).toBe("sell");
    expect(long.action).toBe("buy");
    // Both below spot (puts sold for a bullish credit spread), long further out.
    expect(short.contract!.strike).toBeLessThan(SPOT);
    expect(long.contract!.strike).toBeLessThan(short.contract!.strike);
  });

  it("bear call spread: mirror of the bull put spread on the call side", () => {
    const plan = selectStrikes("bear_call_spread", CHAIN, EXPIRY);
    const [short, long] = plan.legs;
    expect(short.contract!.strike).toBeGreaterThan(SPOT);
    expect(long.contract!.strike).toBeGreaterThan(short.contract!.strike);
  });

  it("long straddle buys the ATM call and put at the same strike", () => {
    const plan = selectStrikes("long_straddle", CHAIN, EXPIRY);
    const [call, put] = plan.legs;
    expect(call).toMatchObject({ action: "buy", type: "call" });
    expect(put).toMatchObject({ action: "buy", type: "put" });
    expect(call.contract!.strike).toBe(put.contract!.strike);
    expect(call.contract!.strike).toBeCloseTo(SPOT, 0);
  });

  it("long strangle buys OTM legs further apart than the straddle's", () => {
    const straddle = selectStrikes("long_straddle", CHAIN, EXPIRY);
    const strangle = selectStrikes("long_strangle", CHAIN, EXPIRY);
    const straddleWidth = straddle.legs[0].contract!.strike - straddle.legs[1].contract!.strike;
    const strangleWidth = strangle.legs[0].contract!.strike - strangle.legs[1].contract!.strike;
    expect(Math.abs(strangleWidth)).toBeGreaterThan(Math.abs(straddleWidth));
  });

  it("call/put debit spreads: long leg nearer the money than the short leg", () => {
    const calls = selectStrikes("call_debit_spread", CHAIN, EXPIRY);
    const [longCall, shortCall] = calls.legs;
    expect(longCall.action).toBe("buy");
    expect(shortCall.action).toBe("sell");
    expect(Math.abs(longCall.contract!.strike - SPOT)).toBeLessThan(
      Math.abs(shortCall.contract!.strike - SPOT),
    );

    const puts = selectStrikes("put_debit_spread", CHAIN, EXPIRY);
    const [longPut, shortPut] = puts.legs;
    expect(Math.abs(longPut.contract!.strike - SPOT)).toBeLessThan(
      Math.abs(shortPut.contract!.strike - SPOT),
    );
  });

  it("calendar sells the front expiry and buys the same strike in the next available expiry", () => {
    const plan = selectStrikes("calendar_call", CHAIN, EXPIRY);
    expect(plan.complete).toBe(true);
    const [front, back] = plan.legs;
    expect(front).toMatchObject({ action: "sell", expiry: EXPIRY });
    expect(back).toMatchObject({ action: "buy", expiry: BACK_EXPIRY });
    expect(front.contract!.strike).toBe(back.contract!.strike);
  });

  it("calendar is incomplete (not just wrong) when no later expiry exists", () => {
    const singleExpiryChain = fabricateChain(EXPIRY, SPOT);
    const plan = selectStrikes("calendar_put", singleExpiryChain, EXPIRY);
    expect(plan.legs).toHaveLength(0);
    expect(plan.complete).toBe(false);
  });

  it("marks the plan incomplete when a leg can't find any delta match", () => {
    const noDeltaChain: ChainContract[] = CHAIN.map((c) => ({ ...c, delta: null }));
    const plan = selectStrikes("long_call", noDeltaChain, EXPIRY);
    expect(plan.legs[0].contract).toBeNull();
    expect(plan.complete).toBe(false);
  });

  it("'none' resolves to an empty, incomplete plan rather than throwing", () => {
    const plan = selectStrikes("none", CHAIN, EXPIRY);
    expect(plan.legs).toHaveLength(0);
    expect(plan.complete).toBe(false);
  });

  describe("skew-aware short strikes", () => {
    // Positive RR = puts bid over calls = downside is the pricier, riskier
    // side; negative is the mirror image on calls. 0.08 and -0.08 both sit
    // past the 0.05 "elevated" threshold.
    const ELEVATED_PUT_SKEW = 0.08;
    const ELEVATED_CALL_SKEW = -0.08;
    const MILD_SKEW = 0.03; // below the threshold — should change nothing

    it("elevated put skew backs the condor's short put further out, leaves the call side alone", () => {
      const base = selectStrikes("iron_condor", FINE_CHAIN, EXPIRY);
      const skewed = selectStrikes("iron_condor", FINE_CHAIN, EXPIRY, ELEVATED_PUT_SKEW);
      const [baseShortPut, , baseShortCall] = base.legs;
      const [skewShortPut, , skewShortCall] = skewed.legs;
      expect(Math.abs(skewShortPut.contract!.strike - SPOT)).toBeGreaterThan(
        Math.abs(baseShortPut.contract!.strike - SPOT),
      );
      expect(skewShortCall.contract!.strike).toBe(baseShortCall.contract!.strike);
    });

    it("elevated call skew backs the condor's short call further out, leaves the put side alone", () => {
      const base = selectStrikes("iron_condor", FINE_CHAIN, EXPIRY);
      const skewed = selectStrikes("iron_condor", FINE_CHAIN, EXPIRY, ELEVATED_CALL_SKEW);
      const [baseShortPut, , baseShortCall] = base.legs;
      const [skewShortPut, , skewShortCall] = skewed.legs;
      expect(skewShortPut.contract!.strike).toBe(baseShortPut.contract!.strike);
      expect(Math.abs(skewShortCall.contract!.strike - SPOT)).toBeGreaterThan(
        Math.abs(baseShortCall.contract!.strike - SPOT),
      );
    });

    it("skew below the elevated threshold leaves every strike at its routine target", () => {
      const base = selectStrikes("iron_condor", FINE_CHAIN, EXPIRY);
      const mild = selectStrikes("iron_condor", FINE_CHAIN, EXPIRY, MILD_SKEW);
      expect(mild.legs.map((l) => l.contract!.strike)).toEqual(
        base.legs.map((l) => l.contract!.strike),
      );
    });

    it("bull put spread backs its short strike off further under elevated put skew", () => {
      const base = selectStrikes("bull_put_spread", FINE_CHAIN, EXPIRY);
      const skewed = selectStrikes("bull_put_spread", FINE_CHAIN, EXPIRY, ELEVATED_PUT_SKEW);
      expect(Math.abs(skewed.legs[0].contract!.strike - SPOT)).toBeGreaterThan(
        Math.abs(base.legs[0].contract!.strike - SPOT),
      );
      // The protective long leg targets a fixed delta regardless of skew.
      expect(skewed.legs[1].contract!.strike).toBe(base.legs[1].contract!.strike);
    });

    it("bear call spread backs its short strike off further under elevated call skew", () => {
      const base = selectStrikes("bear_call_spread", FINE_CHAIN, EXPIRY);
      const skewed = selectStrikes("bear_call_spread", FINE_CHAIN, EXPIRY, ELEVATED_CALL_SKEW);
      expect(Math.abs(skewed.legs[0].contract!.strike - SPOT)).toBeGreaterThan(
        Math.abs(base.legs[0].contract!.strike - SPOT),
      );
    });

    it("a spread on the un-flagged side of skew is untouched (skew only backs off the risky side, never the other)", () => {
      const base = selectStrikes("bear_call_spread", FINE_CHAIN, EXPIRY);
      // Put skew flags the put side; a call spread has nothing on that side.
      const skewed = selectStrikes("bear_call_spread", FINE_CHAIN, EXPIRY, ELEVATED_PUT_SKEW);
      expect(skewed.legs.map((l) => l.contract!.strike)).toEqual(
        base.legs.map((l) => l.contract!.strike),
      );
    });

    it("debit spreads and straddles don't react to skew — the adjustment is scoped to premium-selling structures", () => {
      const base = selectStrikes("call_debit_spread", FINE_CHAIN, EXPIRY);
      const skewed = selectStrikes("call_debit_spread", FINE_CHAIN, EXPIRY, ELEVATED_PUT_SKEW);
      expect(skewed.legs.map((l) => l.contract!.strike)).toEqual(
        base.legs.map((l) => l.contract!.strike),
      );
    });

    it("missing riskReversal behaves exactly like no skew was ever passed", () => {
      const base = selectStrikes("iron_condor", FINE_CHAIN, EXPIRY);
      const undefinedRR = selectStrikes("iron_condor", FINE_CHAIN, EXPIRY, undefined);
      const nullRR = selectStrikes("iron_condor", FINE_CHAIN, EXPIRY, null);
      expect(undefinedRR.legs.map((l) => l.contract!.strike)).toEqual(
        base.legs.map((l) => l.contract!.strike),
      );
      expect(nullRR.legs.map((l) => l.contract!.strike)).toEqual(
        base.legs.map((l) => l.contract!.strike),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// strategyEconomics — cost, risk, breakevens
// ---------------------------------------------------------------------------

/** A plan built by hand so each case pins exact numbers rather than
 * whatever the delta matcher happened to pick. */
function planOf(
  type: Parameters<typeof strategyEconomics>[0]["type"],
  legs: Array<{
    action: "buy" | "sell";
    type: "call" | "put";
    strike: number;
    price: number;
    expiry?: string;
  }>,
) {
  return {
    type,
    complete: true,
    legs: legs.map((l) => ({
      action: l.action,
      type: l.type,
      expiry: l.expiry ?? EXPIRY,
      targetDelta: 0.2,
      contract: {
        strike: l.strike,
        expiry: l.expiry ?? EXPIRY,
        type: l.type,
        price: l.price,
        iv: 0.5,
        delta: 0.2,
        open_interest: 10,
      },
    })),
  };
}

describe("strategyEconomics", () => {
  it("bull put spread: credit, width-minus-credit risk, one breakeven", () => {
    // Sell 95p for 2.00, buy 90p for 1.00 -> $1.00 credit on a $5 width.
    const e = strategyEconomics(
      planOf("bull_put_spread", [
        { action: "sell", type: "put", strike: 95, price: 2 },
        { action: "buy", type: "put", strike: 90, price: 1 },
      ]),
    )!;
    expect(e.netCredit).toBe(100);
    expect(e.maxProfit).toBe(100);
    expect(e.maxLoss).toBe(400); // (5 - 1) * 100
    expect(e.breakevens).toEqual([94]); // short strike - credit
  });

  it("bear call spread mirrors it on the call side", () => {
    const e = strategyEconomics(
      planOf("bear_call_spread", [
        { action: "sell", type: "call", strike: 105, price: 2 },
        { action: "buy", type: "call", strike: 110, price: 1 },
      ]),
    )!;
    expect(e.netCredit).toBe(100);
    expect(e.maxLoss).toBe(400);
    expect(e.breakevens).toEqual([106]); // short strike + credit
  });

  it("iron condor: risk is the WIDER wing, not the sum of both", () => {
    // Only one side can finish ITM — charging both would double-count.
    const e = strategyEconomics(
      planOf("iron_condor", [
        { action: "sell", type: "put", strike: 95, price: 1.5 },
        { action: "buy", type: "put", strike: 90, price: 0.5 }, // $5 wing
        { action: "sell", type: "call", strike: 105, price: 1.5 },
        { action: "buy", type: "call", strike: 115, price: 0.5 }, // $10 wing
      ]),
    )!;
    expect(e.netCredit).toBe(200); // (1.5 - 0.5) * 2 * 100
    expect(e.maxProfit).toBe(200);
    expect(e.maxLoss).toBe(800); // (10 - 2) * 100, the wider wing only
    expect(e.breakevens).toEqual([93, 107]);
  });

  it("debit spread: pays a debit, capped both ways", () => {
    const e = strategyEconomics(
      planOf("call_debit_spread", [
        { action: "buy", type: "call", strike: 100, price: 3 },
        { action: "sell", type: "call", strike: 105, price: 1 },
      ]),
    )!;
    expect(e.netCredit).toBe(-200); // a debit is a negative credit
    expect(e.maxLoss).toBe(200);
    expect(e.maxProfit).toBe(300); // (5 - 2) * 100
    expect(e.breakevens).toEqual([102]);
  });

  it("long straddle: unbounded upside is null, never a number", () => {
    const e = strategyEconomics(
      planOf("long_straddle", [
        { action: "buy", type: "call", strike: 100, price: 3 },
        { action: "buy", type: "put", strike: 100, price: 2 },
      ]),
    )!;
    expect(e.netCredit).toBe(-500);
    expect(e.maxLoss).toBe(500);
    // "unbounded", not null: the upside genuinely has no cap. null would
    // mean "can't compute", which renders as an em dash and reads as
    // missing data rather than as the position's whole point.
    expect(e.maxProfit).toBe("unbounded");
    expect(e.breakevens).toEqual([95, 105]);
  });

  it("calendar spans expiries, so it reports the debit but no expiry payoff", () => {
    const e = strategyEconomics(
      planOf("calendar_call", [
        { action: "sell", type: "call", strike: 100, price: 2, expiry: EXPIRY },
        { action: "buy", type: "call", strike: 100, price: 3.5, expiry: BACK_EXPIRY },
      ]),
    )!;
    expect(e.netCredit).toBe(-150);
    // null, NOT "unbounded" — a calendar's profit IS capped in practice,
    // this just can't find the cap without a model. Labelling it
    // "Unlimited" would be a materially false claim about a real trade.
    expect(e.maxProfit).toBeNull();
    expect(e.maxProfit).not.toBe("unbounded");
    expect(e.maxLoss).toBeNull();
    expect(e.breakevens).toEqual([]);
  });

  it("returns null rather than a confident number built on a hole", () => {
    // An incomplete plan...
    expect(strategyEconomics({ type: "iron_condor", legs: [], complete: false })).toBeNull();

    // ...and a complete one whose leg has no quoted price.
    const unpriced = planOf("bull_put_spread", [
      { action: "sell", type: "put", strike: 95, price: 2 },
      { action: "buy", type: "put", strike: 90, price: 1 },
    ]);
    unpriced.legs[1].contract.price = null as unknown as number;
    expect(strategyEconomics(unpriced)).toBeNull();
  });

  it("works end-to-end off a real selectStrikes plan", () => {
    const plan = selectStrikes("iron_condor", CHAIN, EXPIRY);
    const e = strategyEconomics(plan);
    expect(e).not.toBeNull();
    expect(e!.maxLoss).toBeGreaterThan(0);
    expect(e!.breakevens).toHaveLength(2);
    expect(e!.breakevens[0]).toBeLessThan(e!.breakevens[1]);
  });
});

describe("degenerate plans on a thin chain", () => {
  // A ticker with a single listed put resolves both a condor's short put and
  // its protective wing to that one strike. Found by the engine's backfill on
  // ATAT, where it produced a condor whose max loss computed to a negative
  // number — a trade that reads as impossible to lose.
  const THIN: ChainContract[] = [
    {
      strike: 35,
      expiry: EXPIRY,
      type: "put",
      price: 0.37,
      iv: 0.9,
      delta: -0.22,
      open_interest: 10,
    },
    {
      strike: 35,
      expiry: EXPIRY,
      type: "call",
      price: 2.3,
      iv: 0.9,
      delta: 0.801,
      open_interest: 10,
    },
    {
      strike: 40,
      expiry: EXPIRY,
      type: "call",
      price: 0.3,
      iv: 0.9,
      delta: 0.186,
      open_interest: 10,
    },
    {
      strike: 45,
      expiry: EXPIRY,
      type: "call",
      price: 0.05,
      iv: 0.9,
      delta: 0.034,
      open_interest: 10,
    },
  ];

  it("rejects a condor whose two put legs collapse onto one contract", () => {
    const plan = selectStrikes("iron_condor", THIN, EXPIRY);
    expect(plan.legs.every((l) => l.contract)).toBe(true);
    expect(plan.legs[0].contract!.strike).toBe(plan.legs[1].contract!.strike);
    expect(plan.complete).toBe(false);
    expect(strategyEconomics(plan)).toBeNull();
  });

  it("still allows a straddle to share a strike across call and put", () => {
    const plan = selectStrikes("long_straddle", CHAIN, EXPIRY);
    expect(plan.legs[0].contract!.strike).toBe(plan.legs[1].contract!.strike);
    expect(plan.complete).toBe(true);
  });

  it("still allows a calendar to share a strike across expiries", () => {
    const plan = selectStrikes("calendar_call", CHAIN, EXPIRY);
    expect(plan.legs[0].contract!.strike).toBe(plan.legs[1].contract!.strike);
    expect(plan.complete).toBe(true);
  });
});
