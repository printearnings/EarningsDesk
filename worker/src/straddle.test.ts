import { describe, expect, it } from "vitest";

import {
  putCallVolume,
  selectAtmStraddle,
  underlyingPrice,
  type RawContract,
} from "./straddle";

/**
 * This logic is duplicated from the Python engine (it can't run at the edge),
 * so these tests exist to keep the two implementations honest about the rules
 * that matter: front expiry on or after the print, strike nearest spot, both
 * legs required.
 */

function contract(
  type: "call" | "put",
  strike: number,
  expiry: string,
  price: number | null,
  extra: Partial<RawContract> = {},
): RawContract {
  return {
    details: {
      contract_type: type,
      strike_price: strike,
      expiration_date: expiry,
    },
    last_trade: price === null ? undefined : { price },
    underlying_asset: { price: 100 },
    ...extra,
  };
}

describe("selectAtmStraddle", () => {
  it("picks the strike nearest spot", () => {
    const chain = [
      contract("call", 95, "2026-08-28", 7),
      contract("put", 95, "2026-08-28", 2),
      contract("call", 100, "2026-08-28", 4),
      contract("put", 100, "2026-08-28", 4),
      contract("call", 110, "2026-08-28", 1),
      contract("put", 110, "2026-08-28", 9),
    ];

    const s = selectAtmStraddle(chain, 100, "2026-08-26");
    expect(s?.strike).toBe(100);
    expect(s?.straddle).toBe(8);
    expect(s?.impliedMove).toBeCloseTo(0.08);
  });

  it("ignores expiries before the print", () => {
    /**
     * The rule that makes the number mean anything: a straddle expiring before
     * the report doesn't own the event, so its premium says nothing about the
     * expected move.
     */
    const chain = [
      contract("call", 100, "2026-08-21", 1),
      contract("put", 100, "2026-08-21", 1),
      contract("call", 100, "2026-08-28", 4),
      contract("put", 100, "2026-08-28", 4),
    ];

    const s = selectAtmStraddle(chain, 100, "2026-08-26");
    expect(s?.expiry).toBe("2026-08-28");
    expect(s?.straddle).toBe(8);
  });

  it("takes the nearest qualifying expiry, not the furthest", () => {
    const chain = [
      contract("call", 100, "2026-09-25", 9),
      contract("put", 100, "2026-09-25", 9),
      contract("call", 100, "2026-08-28", 4),
      contract("put", 100, "2026-08-28", 4),
    ];

    expect(selectAtmStraddle(chain, 100, "2026-08-26")?.expiry).toBe(
      "2026-08-28",
    );
  });

  it("skips a strike missing one leg", () => {
    const chain = [
      contract("call", 100, "2026-08-28", 4), // no matching put
      contract("call", 105, "2026-08-28", 2),
      contract("put", 105, "2026-08-28", 6),
    ];

    expect(selectAtmStraddle(chain, 100, "2026-08-26")?.strike).toBe(105);
  });

  it("skips contracts with no usable price", () => {
    const chain = [
      contract("call", 100, "2026-08-28", null),
      contract("put", 100, "2026-08-28", null),
      contract("call", 105, "2026-08-28", 2),
      contract("put", 105, "2026-08-28", 6),
    ];

    expect(selectAtmStraddle(chain, 100, "2026-08-26")?.strike).toBe(105);
  });

  it("falls back to the day close when there is no last trade", () => {
    const chain = [
      { ...contract("call", 100, "2026-08-28", null), day: { close: 4 } },
      { ...contract("put", 100, "2026-08-28", null), day: { close: 4 } },
    ];

    expect(selectAtmStraddle(chain, 100, "2026-08-26")?.straddle).toBe(8);
  });

  it("returns null rather than guessing when nothing qualifies", () => {
    expect(selectAtmStraddle([], 100, "2026-08-26")).toBeNull();
    expect(
      selectAtmStraddle(
        [
          contract("call", 100, "2026-08-21", 4),
          contract("put", 100, "2026-08-21", 4),
        ],
        100,
        "2026-08-26",
      ),
    ).toBeNull();
  });

  it("rejects a nonsensical spot instead of dividing by it", () => {
    const chain = [
      contract("call", 100, "2026-08-28", 4),
      contract("put", 100, "2026-08-28", 4),
    ];
    expect(selectAtmStraddle(chain, 0, "2026-08-26")).toBeNull();
  });
});

describe("putCallVolume", () => {
  it("sums each side and divides puts by calls", () => {
    const chain = [
      { ...contract("call", 100, "2026-08-28", 4), day: { volume: 1000 } },
      { ...contract("put", 100, "2026-08-28", 4), day: { volume: 500 } },
    ];

    const { callVolume, putVolume, ratio } = putCallVolume(chain);
    expect(callVolume).toBe(1000);
    expect(putVolume).toBe(500);
    expect(ratio).toBe(0.5);
  });

  it("returns null rather than Infinity when no calls traded", () => {
    /** Infinity would render as extreme bearishness; the truth is "unknown". */
    const chain = [
      { ...contract("put", 100, "2026-08-28", 4), day: { volume: 500 } },
    ];
    expect(putCallVolume(chain).ratio).toBeNull();
  });
});

describe("underlyingPrice", () => {
  it("reads the first usable spot on the chain", () => {
    expect(underlyingPrice([contract("call", 100, "2026-08-28", 4)])).toBe(100);
  });

  it("skips absent and zero prices", () => {
    const chain: RawContract[] = [
      { details: { contract_type: "call" } },
      { underlying_asset: { price: 0 } },
      { underlying_asset: { price: 223.76 } },
    ];
    expect(underlyingPrice(chain)).toBe(223.76);
  });

  it("returns null when the chain carries no spot at all", () => {
    expect(
      underlyingPrice([{ details: { contract_type: "call" } }]),
    ).toBeNull();
  });
});
