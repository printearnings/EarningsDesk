import { describe, expect, it } from "vitest";

import {
  EMPTY,
  compact,
  eps,
  formatAge,
  formatDate,
  pct,
  pctRange,
  pctRaw,
  pctSigned,
  relativeDays,
  sentimentLabel,
  sessionLabel,
} from "./format";

/**
 * The rule worth guarding: a missing value must never render as zero. "We
 * couldn't fetch the put/call ratio" and "the put/call ratio is 0.00" are
 * opposite claims, and only one of them is true.
 */
describe("null never renders as zero", () => {
  const formatters = { pct, pctSigned, pctRange, pctRaw, eps, compact };

  for (const [name, fn] of Object.entries(formatters)) {
    it(`${name} returns the em dash for null and undefined`, () => {
      expect(fn(null)).toBe(EMPTY);
      expect(fn(undefined)).toBe(EMPTY);
    });

    it(`${name} still renders a real zero`, () => {
      expect(fn(0)).not.toBe(EMPTY);
    });
  }

  it("rejects NaN and Infinity, which arithmetic can produce", () => {
    expect(pct(NaN)).toBe(EMPTY);
    expect(pct(Infinity)).toBe(EMPTY);
  });
});

describe("percentages", () => {
  it("scales fractions", () => {
    expect(pct(0.0785)).toBe("7.8%");
  });

  it("signs where direction matters", () => {
    expect(pctSigned(0.0785)).toBe("+7.8%");
    expect(pctSigned(-0.03)).toBe("-3.0%");
    expect(pctSigned(0)).toBe("0.0%");
  });

  it("marks an implied move as symmetric", () => {
    expect(pctRange(0.0785)).toBe("±7.8%");
  });

  it("passes through already-percent values like EPS surprise", () => {
    expect(pctRaw(5.54)).toBe("+5.54%");
    expect(pctRaw(-7.97)).toBe("-7.97%");
  });
});

describe("dates", () => {
  /**
   * The bug this guards: `new Date("2026-08-26")` parses as UTC midnight, so
   * anyone west of Greenwich sees "Aug 25". Worse, the build machine and the
   * browser can disagree, which React reports as a hydration mismatch.
   */
  it("does not shift the day across timezones", () => {
    expect(formatDate("2026-08-26")).toBe("Aug 26, 2026");
  });

  it("handles a full ISO timestamp", () => {
    expect(formatDate("2026-08-26T20:00:00Z")).toBe("Aug 26, 2026");
  });

  it("returns the em dash for missing or malformed input", () => {
    expect(formatDate(null)).toBe(EMPTY);
    expect(formatDate("")).toBe(EMPTY);
    expect(formatDate("not-a-date")).toBe(EMPTY);
  });
});

describe("relativeDays", () => {
  it("uses words for the near term", () => {
    expect(relativeDays(0)).toBe("today");
    expect(relativeDays(1)).toBe("tomorrow");
    expect(relativeDays(-1)).toBe("yesterday");
  });

  it("counts in both directions", () => {
    expect(relativeDays(17)).toBe("in 17 days");
    expect(relativeDays(-3)).toBe("3 days ago");
  });
});

describe("formatAge", () => {
  it("scales the unit to the magnitude", () => {
    expect(formatAge(0.3)).toBe("18m ago");
    expect(formatAge(6)).toBe("6h ago");
    expect(formatAge(48)).toBe("2 days ago");
  });

  it("does not say '1 days ago'", () => {
    expect(formatAge(24)).toBe("1 day ago");
  });
});

describe("sessionLabel", () => {
  it("expands the acronyms traders use", () => {
    expect(sessionLabel("BMO")).toBe("before the open");
    expect(sessionLabel("AMC")).toBe("after the close");
  });

  it("returns null when unknown, so callers can omit the badge entirely", () => {
    expect(sessionLabel(null)).toBeNull();
    expect(sessionLabel("???")).toBeNull();
  });
});

describe("sentimentLabel", () => {
  it("buckets rather than implying false precision", () => {
    expect(sentimentLabel(0.8)).toBe("Positive");
    expect(sentimentLabel(0.15)).toBe("Slightly positive");
    expect(sentimentLabel(0)).toBe("Neutral");
    expect(sentimentLabel(-0.6)).toBe("Negative");
  });

  it("treats a missing score as unknown, not neutral", () => {
    expect(sentimentLabel(null)).toBe(EMPTY);
  });
});
