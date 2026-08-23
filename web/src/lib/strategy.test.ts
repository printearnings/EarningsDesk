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
    expect(recommendStrategy({ verdict: null, direction: "BULLISH", ivInverted: false }).type).toBe(
      "none",
    );
  });

  describe("RICH: sell premium, direction picks the side", () => {
    it("bullish -> bull put spread", () => {
      const s = recommendStrategy({ verdict: "RICH", direction: "BULLISH", ivInverted: false });
      expect(s.type).toBe("bull_put_spread");
      expect(s.premium).toBe("sell");
      expect(s.bias).toBe("bullish");
    });

    it("bearish -> bear call spread", () => {
      const s = recommendStrategy({ verdict: "RICH", direction: "BEARISH", ivInverted: false });
      expect(s.type).toBe("bear_call_spread");
      expect(s.premium).toBe("sell");
      expect(s.bias).toBe("bearish");
    });

    it("neutral -> iron condor (never a naked short strangle)", () => {
      const s = recommendStrategy({ verdict: "RICH", direction: "NEUTRAL", ivInverted: false });
      expect(s.type).toBe("iron_condor");
      expect(s.bias).toBe("neutral");
    });

    it("missing direction defaults to neutral -> iron condor", () => {
      expect(recommendStrategy({ verdict: "RICH", direction: null, ivInverted: false }).type).toBe(
        "iron_condor",
      );
    });
  });

  describe("CHEAP: buy premium, direction picks the side", () => {
    it("bullish -> call debit spread, not a naked long call", () => {
      const s = recommendStrategy({ verdict: "CHEAP", direction: "BULLISH", ivInverted: false });
      expect(s.type).toBe("call_debit_spread");
      expect(s.premium).toBe("buy");
    });

    it("bearish -> put debit spread", () => {
      const s = recommendStrategy({ verdict: "CHEAP", direction: "BEARISH", ivInverted: false });
      expect(s.type).toBe("put_debit_spread");
    });

    it("neutral -> long straddle", () => {
      const s = recommendStrategy({ verdict: "CHEAP", direction: "NEUTRAL", ivInverted: false });
      expect(s.type).toBe("long_straddle");
      expect(s.premium).toBe("buy");
    });
  });

  describe("FAIR: no vol edge, only a real directional view earns a call", () => {
    it("bullish -> call debit spread", () => {
      expect(recommendStrategy({ verdict: "FAIR", direction: "BULLISH", ivInverted: false }).type).toBe(
        "call_debit_spread",
      );
    });

    it("bearish -> put debit spread", () => {
      expect(recommendStrategy({ verdict: "FAIR", direction: "BEARISH", ivInverted: false }).type).toBe(
        "put_debit_spread",
      );
    });

    it("neutral -> no recommendation", () => {
      expect(recommendStrategy({ verdict: "FAIR", direction: "NEUTRAL", ivInverted: false }).type).toBe(
        "none",
      );
    });
  });

  describe("inverted term structure overrides to a calendar when RICH", () => {
    it("bearish + inverted -> put calendar, not a bear call spread", () => {
      const s = recommendStrategy({ verdict: "RICH", direction: "BEARISH", ivInverted: true });
      expect(s.type).toBe("calendar_put");
    });

    it("bullish/neutral + inverted -> call calendar", () => {
      expect(
        recommendStrategy({ verdict: "RICH", direction: "BULLISH", ivInverted: true }).type,
      ).toBe("calendar_call");
      expect(
        recommendStrategy({ verdict: "RICH", direction: "NEUTRAL", ivInverted: true }).type,
      ).toBe("calendar_call");
    });

    it("does not override CHEAP or FAIR — inversion only matters when selling premium", () => {
      expect(
        recommendStrategy({ verdict: "CHEAP", direction: "NEUTRAL", ivInverted: true }).type,
      ).toBe("long_straddle");
      expect(
        recommendStrategy({ verdict: "FAIR", direction: "BULLISH", ivInverted: true }).type,
      ).toBe("call_debit_spread");
    });
  });

  it("never recommends a naked short (undefined-risk) structure", () => {
    const UNDEFINED_RISK = new Set(["short_strangle", "naked_call", "naked_put"]);
    const verdicts = ["RICH", "CHEAP", "FAIR"] as const;
    const directions = ["BULLISH", "BEARISH", "NEUTRAL"] as const;
    for (const verdict of verdicts) {
      for (const direction of directions) {
        for (const ivInverted of [true, false]) {
          const { type } = recommendStrategy({ verdict, direction, ivInverted });
          expect(UNDEFINED_RISK.has(type)).toBe(false);
        }
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
 * (0.07 through 0.50) has a close real match. */
function fabricateChain(expiry: string, spot: number): ChainContract[] {
  const contracts: ChainContract[] = [];
  for (let i = -12; i <= 12; i++) {
    const strike = spot + i * 2.5;
    // Rough delta curve: 0.50 ATM, decaying ~0.05 per $2.5 step away from spot.
    const callDelta = Math.max(0.02, Math.min(0.98, 0.5 - i * 0.055));
    const putDelta = -Math.max(0.02, Math.min(0.98, 0.5 + i * 0.055));
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
    // A capped number here would understate the position's whole point.
    expect(e.maxProfit).toBeNull();
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
    expect(e.maxProfit).toBeNull();
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
