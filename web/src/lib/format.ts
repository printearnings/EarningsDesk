/**
 * Display formatting.
 *
 * The rule this file exists to enforce: **null never renders as zero.** A
 * missing put/call ratio and a put/call ratio of 0.00 mean opposite things:
 * "we couldn't get the data" versus "there were no puts traded". Every
 * formatter here returns EMPTY for null/undefined so a component can't
 * accidentally paper over a gap.
 *
 * EMPTY is blank rather than a dash. The invariant is that a gap must not be
 * mistaken for a real number; which glyph marks it is a presentation choice,
 * and this app renders it as nothing at all.
 */

export const EMPTY = "";

type Num = number | null | undefined;

const isNum = (v: Num): v is number => typeof v === "number" && Number.isFinite(v);

/** 0.0785 -> "7.8%". Unsigned — use for magnitudes like an implied move. */
export function pct(value: Num, digits = 1): string {
  return isNum(value) ? `${(value * 100).toFixed(digits)}%` : EMPTY;
}

/** 0.0785 -> "+7.8%", -0.03 -> "-3.0%". Use where direction matters. */
export function pctSigned(value: Num, digits = 1): string {
  if (!isNum(value)) return EMPTY;
  const s = (value * 100).toFixed(digits);
  return value > 0 ? `+${s}%` : `${s}%`;
}

/** An implied move is symmetric: 0.0785 -> "±7.8%". */
export function pctRange(value: Num, digits = 1): string {
  return isNum(value) ? `±${(value * 100).toFixed(digits)}%` : EMPTY;
}

/** Already-percent values from the source, e.g. EPS surprise 5.54 -> "+5.54%". */
export function pctRaw(value: Num, digits = 2): string {
  if (!isNum(value)) return EMPTY;
  const s = value.toFixed(digits);
  return value > 0 ? `+${s}%` : `${s}%`;
}

export function money(value: Num, digits = 2): string {
  return isNum(value) ? `$${value.toFixed(digits)}` : EMPTY;
}

export function num(value: Num, digits = 2): string {
  return isNum(value) ? value.toFixed(digits) : EMPTY;
}

export function compact(value: Num): string {
  if (!isNum(value)) return EMPTY;
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
}

/** A dollar figure too large for `money`'s two decimals to read at a glance —
 * revenue, net income. "$94.0B", not "$94,036,000,000.00". */
export function moneyCompact(value: Num): string {
  if (!isNum(value)) return EMPTY;
  const sign = value < 0 ? "-" : "";
  return `${sign}$${compact(Math.abs(value))}`;
}

/** EPS figures are quoted to the cent and shouldn't be abbreviated. */
export function eps(value: Num): string {
  return isNum(value) ? `$${value.toFixed(2)}` : EMPTY;
}

export function ratio(value: Num, digits = 2): string {
  return isNum(value) ? `${value.toFixed(digits)}x` : EMPTY;
}

/**
 * Dates arrive as ISO strings and must render identically on the build
 * machine and in the browser, or React logs a hydration mismatch. Parsing the
 * parts by hand avoids `new Date("2026-08-26")` being read as UTC midnight and
 * displaying as the 25th for anyone west of Greenwich.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return EMPTY;
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function formatDateShort(iso: string | null | undefined): string {
  const full = formatDate(iso);
  return full === EMPTY ? EMPTY : full.replace(/, \d{4}$/, "");
}

/** "in 17 days" / "tomorrow" / "today" / "3 days ago". */
export function relativeDays(days: number | null | undefined): string {
  if (typeof days !== "number") return EMPTY;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

/** Calendar-day distance from "today" to an ISO date — negative for the
 * past, null when unparseable. Parsed as calendar-local, matching
 * formatDate's timezone-safety rationale. The numeric building block behind
 * relativeDaysFromDate, exported separately for surfaces that need to sort
 * by it (a screener ordering "soonest report first") rather than just
 * display it. */
export function daysUntilFromDate(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;

  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Same as relativeDays, but computed from an ISO date string against
 * "today" — for surfaces that only have a date, not a precomputed day count
 * (the API's `days_until` field belongs to CalendarEntry, not every schema
 * that carries a date). */
export function relativeDaysFromDate(iso: string | null | undefined): string {
  const days = daysUntilFromDate(iso);
  return days === null ? EMPTY : relativeDays(days);
}

/** How old the snapshot is, for the freshness label. */
export function formatAge(hours: number | null | undefined): string {
  if (typeof hours !== "number") return EMPTY;
  if (hours < 1) return `${Math.round(hours * 60)}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** "AMC" -> "after the close" — traders know the acronym, everyone else doesn't. */
export function sessionLabel(session: string | null | undefined): string | null {
  if (session === "BMO") return "before the open";
  if (session === "AMC") return "after the close";
  return null;
}

/**
 * Sentiment and analyst scores are both [-1, 1]. Bucketing them keeps the UI
 * from implying more precision than an LLM headline score actually carries.
 */
export function sentimentLabel(score: Num): string {
  if (!isNum(score)) return EMPTY;
  if (score >= 0.5) return "Positive";
  if (score >= 0.15) return "Slightly positive";
  if (score > -0.15) return "Neutral";
  if (score > -0.5) return "Slightly negative";
  return "Negative";
}
