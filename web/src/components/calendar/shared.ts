import { sessionLabel } from "@/lib/format";
import type { CalendarEntry } from "@/lib/types";

/**
 * Shared bits for the earnings calendar: calendar-local date math, the two
 * derived numbers every view shows, and the .ics export.
 *
 * Dates are ISO strings built from local y/m/d parts, never through
 * `Date#toISOString`, which converts via UTC and can shift a date near
 * midnight (same rule as lib/format).
 */

export type Names = Record<string, { name: string | null; domain: string | null }>;

/** At-the-money open interest below this reads as "thin": wide spreads, hard
 * to fill at a fair price. Roughly the bottom third of the tracked universe. */
export const THIN_OI = 100;

export function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

export function todayIso(): string {
  const now = new Date();
  return isoOf(now.getFullYear(), now.getMonth(), now.getDate());
}

export function parts(dateIso: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateIso.split("-").map(Number);
  return { y, m: m - 1, d };
}

/** "Monday, Sep 28". */
export function longDay(dateIso: string): string {
  const { y, m, d } = parts(dateIso);
  return new Date(y, m, d).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function isWeekend(dateIso: string): boolean {
  const { y, m, d } = parts(dateIso);
  const dow = new Date(y, m, d).getDay();
  return dow === 0 || dow === 6;
}

/** Implied move as a multiple of the stock's typical move (2.0 = twice). */
export function multiple(e: CalendarEntry): number | null {
  return typeof e.implied_move === "number" && e.hist_avg_move
    ? e.implied_move / e.hist_avg_move
    : null;
}

export function isThin(e: CalendarEntry): boolean {
  return typeof e.atm_open_interest === "number" && e.atm_open_interest < THIN_OI;
}

/** Tailwind text color for an implied move, by verdict. */
export function impliedClass(verdict: string | null | undefined): string {
  if (verdict === "RICH") return "text-[var(--color-verdict-rich)]";
  if (verdict === "CHEAP") return "text-[var(--color-verdict-cheap)]";
  return "text-[var(--color-heading)]";
}

/** Priced names first, biggest implied move first; unpriced names last. */
export function byImpliedDesc(a: CalendarEntry, b: CalendarEntry): number {
  return (b.implied_move ?? -1) - (a.implied_move ?? -1) || a.ticker.localeCompare(b.ticker);
}

// ---- .ics export -----------------------------------------------------------

function icsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function compactDate(dateIso: string): string {
  return dateIso.replace(/-/g, "");
}

/**
 * An all-day calendar event per report, with the implied and typical move
 * and a link back to the ticker page in the description. Built in the
 * browser (no server, no account), so "add to calendar" works on the static
 * site today. It is the first step toward alerts.
 */
export function buildIcs(entries: CalendarEntry[], names: Names, origin: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PrintEarnings//Earnings Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const e of entries) {
    const when = sessionLabel(e.session);
    const name = names[e.ticker]?.name;
    const url = `${origin}/t/${e.ticker}/`;
    const priced =
      typeof e.implied_move === "number"
        ? `Options pricing ±${(e.implied_move * 100).toFixed(1)}%` +
          (e.hist_avg_move ? ` vs a typical ±${(e.hist_avg_move * 100).toFixed(1)}%` : "") +
          (e.verdict ? ` (${e.verdict})` : "") +
          " as of the last update."
        : "Options pricing not captured yet.";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.ticker}-${e.report_date}@printearnings`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(e.report_date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(e.report_date, 1))}`,
      `SUMMARY:${icsText(`${e.ticker} earnings${when ? `, ${when}` : ""}`)}`,
      `DESCRIPTION:${icsText(
        `${name ? `${name}. ` : ""}${priced}\n${url}\nInformational only, not financial advice.`,
      )}`,
      `URL:${url}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function downloadFile(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function buildCsv(entries: CalendarEntry[], names: Names): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [
    [
      "date",
      "ticker",
      "company",
      "session",
      "implied_move",
      "typical_move",
      "priced_vs_typical",
      "verdict",
      "atm_open_interest",
    ],
    ...entries.map((e) => {
      const mult = multiple(e);
      return [
        e.report_date,
        e.ticker,
        names[e.ticker]?.name ?? "",
        e.session ?? "",
        typeof e.implied_move === "number" ? (e.implied_move * 100).toFixed(2) + "%" : "",
        e.hist_avg_move ? (e.hist_avg_move * 100).toFixed(2) + "%" : "",
        mult !== null ? mult.toFixed(2) : "",
        e.verdict ?? "",
        e.atm_open_interest != null ? String(e.atm_open_interest) : "",
      ];
    }),
  ];
  return rows.map((r) => r.map((c) => esc(String(c))).join(",")).join("\n") + "\n";
}
