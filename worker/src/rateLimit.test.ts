import { describe, expect, it } from "vitest";

import { checkGlobalRateLimit, type Env } from "./index";

/**
 * checkGlobalRateLimit is the site-wide circuit breaker added alongside the
 * existing per-IP limiter (checkRateLimit): same fixed-window mechanism, but
 * one shared counter instead of one per visitor. These tests exist to pin
 * down the two behaviors that actually matter — it blocks once the shared
 * budget is spent, and a different `kind` gets its own, independent budget.
 */

/** Minimal in-memory stand-in for the two KVNamespace methods this function
 * calls — a real KV binding only exists inside a deployed Worker. */
function fakeKv(): {
  get: (k: string) => Promise<string | null>;
  put: (k: string, v: string) => Promise<void>;
} & Env["RATE_LIMIT"] {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as Env["RATE_LIMIT"] & {
    get: (k: string) => Promise<string | null>;
    put: (k: string, v: string) => Promise<void>;
  };
}

function env(): Env {
  return {
    ASSETS: {} as Env["ASSETS"],
    RATE_LIMIT: fakeKv(),
    MASSIVE_API_KEY: "test",
    SUPPORT_EMAIL: {} as Env["SUPPORT_EMAIL"],
  };
}

describe("checkGlobalRateLimit", () => {
  it("allows requests under the limit and counts down `remaining`", async () => {
    const e = env();
    const first = await checkGlobalRateLimit(e, "chart", 2);
    const second = await checkGlobalRateLimit(e, "chart", 2);
    expect(first).toEqual({ ok: true, remaining: 1, limit: 2 });
    expect(second).toEqual({ ok: true, remaining: 0, limit: 2 });
  });

  it("blocks once the shared budget is spent, regardless of caller identity", async () => {
    const e = env();
    await checkGlobalRateLimit(e, "chart", 1);
    const blocked = await checkGlobalRateLimit(e, "chart", 1);
    expect(blocked).toEqual({ ok: false, remaining: 0, limit: 1 });
  });

  it("tracks each `kind` as an independent budget", async () => {
    const e = env();
    await checkGlobalRateLimit(e, "chart", 1);
    const indicators = await checkGlobalRateLimit(e, "indicators", 1);
    expect(indicators.ok).toBe(true);
  });
});
