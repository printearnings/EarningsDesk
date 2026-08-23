import { describe, expect, it } from "vitest";

import { type ChainContract, recommendStrategy, selectStrikes } from "./strategy";

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
