import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { type ChainContract, recommendStrategy, selectStrikes } from "./strategy";

/**
 * Conformance against the engine's copy of the strategy logic.
 *
 * `recommendStrategy`/`selectStrikes` exist twice on purpose — here for the
 * interactive Simulator, and in Python (`earnings/strategy/structures.py`)
 * for scoring a recommendation against real option bars after the print.
 * Two implementations of one decision matrix drift silently, and a drifted
 * copy means the track record measures a structure the site never showed.
 *
 * Both suites assert the SAME fixture file, which lives in the engine repo.
 * Change the matrix in one language and this fails until the fixture and the
 * other language agree.
 */

// The engine repo sits beside this one, but at different depths locally vs in
// CI (deploy.yml checks both out as siblings, while a dev machine nests the
// engine one level deeper). Try both rather than encode one and silently skip.
const FIXTURE_CANDIDATES = [
  "../../Earnings/Earnings/tests/fixtures/strategy_cases.json", // local checkout
  "../../Earnings/tests/fixtures/strategy_cases.json", // CI (siblings)
];

function loadFixture() {
  const tried: string[] = [];
  for (const rel of FIXTURE_CANDIDATES) {
    const path = resolve(process.cwd(), rel);
    tried.push(path);
    try {
      return JSON.parse(readFileSync(path, "utf-8"));
    } catch {
      // try the next candidate
    }
  }
  // Deliberately throw rather than skip. A conformance test that quietly
  // skips when it cannot find its fixture provides no protection at all,
  // which is worse than not having it.
  throw new Error(
    `Could not find strategy_cases.json in the engine repo. Tried:\n${tried.join("\n")}`,
  );
}

interface RecommendCase {
  verdict: string | null;
  direction: string | null;
  iv_inverted: boolean;
  type: string;
  bias: string;
  premium: string;
}

interface SelectCase {
  strategy: string;
  risk_reversal: number | null;
  target_deltas: number[];
}

const fixture = loadFixture();

const EXPIRY = "2026-08-28";
const BACK_EXPIRY = "2026-09-04";
const SPOT = 100;

/** Mirrors the engine test's `_chain`: same delta curve, same 50c step, so
 * both languages resolve the same leg count from an equivalent ladder. */
function chain(expiry: string, step = 0.5): ChainContract[] {
  const out: ChainContract[] = [];
  const deltaPerStep = 0.055 * (step / 2.5);
  const n = Math.round(12 * (2.5 / step));
  for (let i = -n; i <= n; i++) {
    const strike = SPOT + i * step;
    const callDelta = Math.max(0.02, Math.min(0.98, 0.5 - i * deltaPerStep));
    const putDelta = -Math.max(0.02, Math.min(0.98, 0.5 + i * deltaPerStep));
    out.push({
      strike,
      expiry,
      type: "call",
      price: 1,
      iv: 0.5,
      delta: callDelta,
      open_interest: 100,
    });
    out.push({
      strike,
      expiry,
      type: "put",
      price: 1,
      iv: 0.5,
      delta: putDelta,
      open_interest: 100,
    });
  }
  return out;
}

const CHAIN = [...chain(EXPIRY), ...chain(BACK_EXPIRY)];

describe("conformance with earnings/strategy/structures.py", () => {
  it("loads the shared fixture from the engine repo", () => {
    expect(fixture.recommend.length).toBeGreaterThan(0);
    expect(fixture.select.length).toBeGreaterThan(0);
  });

  describe("recommendStrategy", () => {
    for (const c of fixture.recommend as RecommendCase[]) {
      it(`${c.verdict}/${c.direction}/inverted=${c.iv_inverted} -> ${c.type}`, () => {
        const s = recommendStrategy({
          verdict: c.verdict as never,
          direction: c.direction as never,
          ivInverted: c.iv_inverted,
        });
        expect(s.type).toBe(c.type);
        expect(s.bias).toBe(c.bias);
        expect(s.premium).toBe(c.premium);
      });
    }
  });

  describe("selectStrikes target deltas", () => {
    for (const c of fixture.select as SelectCase[]) {
      it(`${c.strategy} rr=${c.risk_reversal}`, () => {
        const plan = selectStrikes(c.strategy as never, CHAIN, EXPIRY, c.risk_reversal);
        const actual = plan.legs.map((l) => l.targetDelta);
        expect(actual).toHaveLength(c.target_deltas.length);
        actual.forEach((d, i) => expect(d).toBeCloseTo(c.target_deltas[i], 6));
      });
    }
  });
});
