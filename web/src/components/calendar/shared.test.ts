import { describe, expect, it } from "vitest";

import type { CalendarEntry } from "@/lib/types";

import { addDays, buildCsv, buildIcs, isThin, multiple } from "./shared";

const entry = (over: Partial<CalendarEntry> = {}): CalendarEntry => ({
  ticker: "JEF",
  report_date: "2026-09-28",
  session: "AMC",
  days_until: 2,
  verdict: "RICH",
  implied_move: 0.103,
  hist_avg_move: 0.051,
  atm_open_interest: 325,
  ...over,
});

describe("calendar helpers", () => {
  it("adds days across a month boundary without UTC drift", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("computes the priced multiple, or null when typical is missing", () => {
    expect(multiple(entry())).toBeCloseTo(2.02, 2);
    expect(multiple(entry({ hist_avg_move: null }))).toBeNull();
    expect(multiple(entry({ implied_move: null }))).toBeNull();
  });

  it("flags thin open interest but not unknown open interest", () => {
    expect(isThin(entry({ atm_open_interest: 25 }))).toBe(true);
    expect(isThin(entry({ atm_open_interest: 325 }))).toBe(false);
    expect(isThin(entry({ atm_open_interest: null }))).toBe(false);
  });
});

describe("buildIcs", () => {
  const ics = buildIcs(
    [entry(), entry({ ticker: "CCL", report_date: "2026-09-29", session: "BMO" })],
    { JEF: { name: "Jefferies Financial Group, Inc.", domain: null } },
    "https://printearnings.com",
  );

  it("is a CRLF calendar with one all-day event per report", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("DTSTART;VALUE=DATE:20260928");
    expect(ics).toContain("DTEND;VALUE=DATE:20260929");
    expect(ics).toContain("UID:JEF-2026-09-28@printearnings");
  });

  it("escapes commas in text fields and links back to the ticker page", () => {
    expect(ics).toContain("SUMMARY:JEF earnings\\, after the close");
    expect(ics).toContain("Jefferies Financial Group\\, Inc.");
    expect(ics).toContain("URL:https://printearnings.com/t/JEF/");
    expect(ics).toContain("not financial advice");
  });
});

describe("buildCsv", () => {
  it("writes a header and quotes fields containing commas", () => {
    const csv = buildCsv([entry()], { JEF: { name: "Jefferies, Inc.", domain: null } });
    const [header, row] = csv.trim().split("\n");
    expect(header.startsWith("date,ticker,company")).toBe(true);
    expect(row).toContain('"Jefferies, Inc."');
    expect(row).toContain("10.30%");
    expect(row).toContain("2.02");
  });
});
