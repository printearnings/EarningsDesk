import { describe, expect, it } from "vitest";

import {
  MIN_MOVES_FOR_BACKTEST,
  backtestImpliedMove,
  backtestRelevance,
  type PastMove,
} from "./backtest";

const mv = (...moves: number[]): PastMove[] =>
  moves.map((move, i) => ({ report_date: `2026-0${(i % 9) + 1}-01`, move }));

describe("backtestImpliedMove", () => {
  it("counts prints inside vs outside the currently-implied move", () => {
    // implied ±10%: three within (2%, -5%, 9%), two breached (-14%, 22%)
    const r = backtestImpliedMove(mv(0.02, -0.05, 0.09, -0.14, 0.22), 0.1)!;
    expect(r.within).toBe(3);
    expect(r.breached).toBe(2);
    expect(r.total).toBe(5);
    expect(r.withinRate).toBeCloseTo(0.6);
  });

  it("uses absolute magnitude — direction is not what this test measures", () => {
    // Same magnitudes, opposite signs, must give the identical result.
    const up = backtestImpliedMove(mv(0.12, 0.03, 0.04, 0.05), 0.1)!;
    const down = backtestImpliedMove(mv(-0.12, -0.03, -0.04, -0.05), 0.1)!;
    expect(down).toEqual(up);
  });

  it("reports the largest move, for a worst-case line", () => {
    const r = backtestImpliedMove(mv(0.02, -0.18, 0.05, 0.03), 0.1)!;
    expect(r.largestMove).toBeCloseTo(0.18);
  });

  it("counts a move exactly at the implied as within — the seller keeps it", () => {
    const r = backtestImpliedMove(mv(0.1, 0.01, 0.02, 0.03), 0.1)!;
    expect(r.within).toBe(4);
    expect(r.breached).toBe(0);
  });

  it("returns null below the minimum sample rather than a screenshot-able rate", () => {
    // 2 of 3 would render as "67%" and read as a finding.
    expect(backtestImpliedMove(mv(0.02, 0.03, 0.22), 0.1)).toBeNull();
    expect(mv(0.02, 0.03, 0.22)).toHaveLength(MIN_MOVES_FOR_BACKTEST - 1);
  });

  it("returns null without a usable implied move to compare against", () => {
    const moves = mv(0.02, 0.03, 0.04, 0.05);
    expect(backtestImpliedMove(moves, null)).toBeNull();
    expect(backtestImpliedMove(moves, undefined)).toBeNull();
    expect(backtestImpliedMove(moves, 0)).toBeNull();
    expect(backtestImpliedMove(moves, -0.1)).toBeNull();
    expect(backtestImpliedMove(moves, NaN)).toBeNull();
  });

  it("ignores non-finite moves rather than propagating them into the rate", () => {
    const dirty: PastMove[] = [
      ...mv(0.02, 0.03, 0.04, 0.05),
      { report_date: "2026-09-01", move: NaN },
    ];
    const r = backtestImpliedMove(dirty, 0.1)!;
    expect(r.total).toBe(4);
    expect(Number.isFinite(r.withinRate)).toBe(true);
  });

  it("handles an empty history", () => {
    expect(backtestImpliedMove([], 0.1)).toBeNull();
  });
});

describe("backtestRelevance", () => {
  it("a condor wants the stock to stay inside the implied move", () => {
    expect(backtestRelevance("iron_condor")).toBe("wants_within");
  });

  it("a straddle/strangle wants it to break through", () => {
    expect(backtestRelevance("long_straddle")).toBe("wants_breach");
    expect(backtestRelevance("long_strangle")).toBe("wants_breach");
  });

  it("directional structures get n/a — this test can't speak to them", () => {
    // The outcome of a bull put spread turns on WHICH WAY the stock moved,
    // and this test only measures how far. Reporting a rate would answer a
    // question nobody asked with a number that looks like it did.
    for (const t of [
      "bull_put_spread",
      "bear_call_spread",
      "call_debit_spread",
      "put_debit_spread",
      "calendar_call",
      "calendar_put",
      "long_call",
      "long_put",
      "none",
    ]) {
      expect(backtestRelevance(t)).toBe("n/a");
    }
  });
});
