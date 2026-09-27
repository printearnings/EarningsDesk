import Link from "next/link";

import { LandingPreview, VerdictChip } from "@/components/LandingPreview";
import { TickerSearch } from "@/components/TickerSearch";
import { getCalendar, getIndex, getTicker, getTrackRecord } from "@/lib/api";
import type { CalendarEntry, TickerPage, TrackRecordPage } from "@/lib/api";
import { formatDate, pct, pctRange, pctSigned } from "@/lib/format";
import { countOutside, type PreviewTicker } from "@/lib/landing";

export const metadata = {
  title: "PrintEarnings | Know what's priced in before the print",
};

/**
 * Landing page, in the dark "terminal" look (scoped by `.landing` in
 * globals.css, so the app itself keeps its own theme).
 *
 * Search is still the first action: someone who lands here usually knows
 * what they came to look up. Below it the page shows the product rather
 * than describing it. The preview card is a live read of the stocks reporting
 * soonest, and every number on the page is build-time data:
 *   - the reporting-soon tickers and their preview come from the calendar
 *     and each ticker's page data
 *   - the proof figures come from the public track record, the same numbers
 *     /track-record/ shows, misses included
 * Nothing is hardcoded, so the page is never staler than the last nightly
 * build and never claims a figure the site can't back up.
 *
 * Voice: plain language for a time-poor retail trader. It describes what
 * the market is pricing and what the stock has done, and never says what to
 * do about it.
 */

const PREVIEW_COUNT = 7;

export default async function LandingPage() {
  const [index, calendar, record] = await Promise.all([
    getIndex(),
    getCalendar(14),
    getTrackRecord(),
  ]);

  const candidates = calendar.entries
    .filter(
      (e): e is CalendarEntry & { implied_move: number } =>
        typeof e.implied_move === "number" && (e.days_until ?? 0) >= 0,
    )
    .slice(0, PREVIEW_COUNT);
  const pages = await Promise.all(candidates.map((e) => getTicker(e.ticker)));
  const preview = candidates.map((e, i) => toPreview(e, pages[i]));

  // Open on a name that has history to show and a non-FAIR read, so the
  // first thing a visitor sees shows the comparison clearly.
  const defaultIndex = Math.max(
    0,
    preview.findIndex((p) => p.moves.length >= 4 && p.verdict && p.verdict !== "FAIR"),
  );
  const featured = preview[defaultIndex];

  return (
    <div className="landing min-h-screen">
      <LandingNav />

      <main className="pt-16">
        {/* HERO */}
        <section className="relative overflow-hidden px-4 pt-12 pb-16 sm:px-6 lg:px-8 lg:pb-24">
          <div className="landing-glow pointer-events-none absolute inset-0" aria-hidden />

          <div className="relative mx-auto flex max-w-7xl flex-col items-center text-center">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--l-line-strong)] bg-[var(--l-card)]/80 px-3 py-1.5 font-mono text-[11px] tracking-wider text-[var(--l-muted)] uppercase backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-[var(--l-cheap)]" aria-hidden />
              {calendar.entries.length} reports in the next two weeks
              <span className="text-[var(--l-line-strong)]">•</span>
              <span className="text-[var(--l-accent)]">
                Updated {formatDate(calendar.as_of)}
              </span>
            </p>

            <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight text-[var(--l-text)] sm:text-6xl lg:text-[62px] lg:leading-[1.08]">
              Know what&rsquo;s priced in
              <br className="hidden sm:inline" />{" "}
              <span className="bg-gradient-to-r from-white via-[var(--l-accent-soft)] to-[var(--l-accent)] bg-clip-text text-transparent">
                before the print.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--l-muted)] sm:text-lg">
              What the options market expects from the report, next to how the stock has
              actually moved its last eight quarters. You get the data and the read. The call is
              yours.
            </p>

            <div className="mt-9 w-full max-w-2xl">
              <div className="flex flex-col gap-2 rounded-xl border border-[var(--l-line)] bg-[var(--l-surface)]/90 p-2 shadow-[0_12px_32px_rgb(0_0_0_/_60%)] backdrop-blur-xl sm:flex-row sm:items-center">
                <div className="flex-1 text-left">
                  <TickerSearch
                    tickers={index.tickers}
                    size="lg"
                    placeholder="Search a ticker, e.g. NVDA"
                  />
                </div>
                <Link
                  href="/dashboard/"
                  className="pressable inline-flex h-14 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[var(--l-accent)] to-[var(--l-accent-soft)] px-6 font-mono text-sm font-bold text-black shadow-[0_0_20px_rgb(0_242_254_/_30%)] transition-[filter] hover:brightness-110"
                >
                  Explore free <span aria-hidden>→</span>
                </Link>
              </div>

              <TrustLine tracked={index.tickers.length} />
            </div>

            {preview.length > 0 && (
              <LandingPreview tickers={preview} defaultIndex={defaultIndex} />
            )}
          </div>
        </section>

        {/* PROOF STRIP: only figures that can't turn against the page. Two
            live counts that only grow (coverage, prints scored) and two fixed
            facts. The accuracy rate lives in card 03, once, next to the
            sell/buy split and the link to the misses, not here as a headline
            number. */}
        <section className="border-y border-[var(--l-line)] bg-[var(--l-surface)] px-4 py-8 sm:px-6 lg:px-8">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-6 text-center md:grid-cols-4">
            <Figure value={atLeast(index.tickers.length)} label="Tickers tracked" />
            <Figure value="8 quarters" label="Of history per ticker" tone="var(--l-accent)" />
            <Figure value={String(record.scored)} label="Prints scored in public" />
            <Figure value="Nightly" label="Updated, nothing hand-picked" />
          </dl>
        </section>

        {/* WHAT YOU GET */}
        <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="mb-14 max-w-3xl">
              <p className="flex items-center gap-2 font-mono text-xs font-bold tracking-[0.18em] text-[var(--l-accent)] uppercase">
                <span className="h-2 w-2 rounded-sm bg-[var(--l-accent)]" aria-hidden />
                What you get
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[var(--l-text)] sm:text-4xl lg:text-[42px] lg:leading-tight">
                The whole setup for a print, readable in a minute.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--l-muted)] sm:text-lg">
                Most earnings coverage stops at the EPS estimate. PrintEarnings puts the move
                the options market is charging next to what the stock has actually done, so you
                can see at a glance whether the premium is unusual.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8">
              <Pillar
                n="01"
                title="Implied vs typical move"
                body="Every ticker page compares the priced-in move against what this stock does after earnings, flagging when the premium is unusual."
              >
                {featured && <ImpliedVsTypical t={featured} />}
              </Pillar>
              <Pillar
                n="02"
                title="Eight quarters of history"
                body="EPS estimate against actual, the gap on the open and whether it filled, and the volume spike. The pattern, not just the last print."
              >
                {featured && <HistoryStrip t={featured} />}
              </Pillar>
              <Pillar
                n="03"
                title="Scored, not asserted"
                body="Every call is checked against the outcome and kept on a public track record. Accuracy is withheld until the sample is large enough to mean anything."
              >
                <TrackRecordCard record={record} />
              </Pillar>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-20 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-[var(--l-line)] bg-gradient-to-b from-[var(--l-panel)] to-[var(--l-surface)] p-8 shadow-[0_20px_60px_rgb(0_0_0_/_60%)] sm:p-12 lg:p-16">
            <div
              className="pointer-events-none absolute top-0 right-0 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgb(0_242_254_/_10%),transparent_70%)]"
              aria-hidden
            />
            <div className="relative max-w-2xl">
              <span className="rounded-full border border-[var(--l-accent)]/30 bg-[var(--l-accent)]/10 px-3 py-1 font-mono text-xs font-semibold tracking-wider text-[var(--l-accent)] uppercase">
                Free, no sign-up
              </span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-[var(--l-text)] sm:text-4xl">
                See who reports this week, and what&rsquo;s priced in.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--l-muted)]">
                Every stock reporting in the next two weeks, with the implied move, how that
                compares to its usual move, and how its last eight prints went.
              </p>
              <div className="mt-8 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/calendar/"
                  className="pressable inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--l-accent)] to-[var(--l-accent-soft)] px-7 py-3.5 font-mono text-sm font-bold text-black shadow-[0_0_25px_rgb(0_242_254_/_28%)] transition-[filter] hover:brightness-110"
                >
                  Open the earnings calendar <span aria-hidden>→</span>
                </Link>
                <Link
                  href="/track-record/"
                  className="pressable inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--l-line)] bg-[var(--l-panel)] px-6 py-3.5 font-mono text-sm font-semibold text-[var(--l-text)] transition-colors hover:border-[var(--l-accent)]/40 hover:text-[var(--l-accent)]"
                >
                  See the track record
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* DISCLAIMER */}
        <section className="px-4 pb-12 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl border-t border-[var(--l-line)] pt-6">
            <p className="rounded-xl border border-[var(--l-line)] bg-[var(--l-surface)] p-4 text-xs leading-relaxed text-[var(--l-subtle)]">
              <strong className="font-medium text-[var(--l-muted)]">
                Not financial advice.
              </strong>{" "}
              PrintEarnings reports what the options market is pricing, how a stock has behaved
              around past earnings, and a flow-and-sentiment directional read. It does not
              predict outcomes. Past behavior does not constrain the next print.
            </p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

function toPreview(
  e: CalendarEntry & { implied_move: number },
  page: TickerPage | null,
): PreviewTicker {
  const moves = (page?.past_moves ?? [])
    .filter((m) => typeof m.move === "number")
    .map((m) => ({ date: m.report_date, move: m.move as number }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8);
  return {
    ticker: e.ticker,
    name: page?.company_name ?? null,
    domain: page?.company_domain ?? null,
    reportDate: e.report_date,
    session: e.session ?? null,
    verdict: e.verdict ?? null,
    implied: e.implied_move,
    typical: e.hist_avg_move ?? null,
    expiry: page?.options?.atm_expiry ?? null,
    moves,
  };
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

const NAV = [
  { href: "/dashboard/", label: "Dashboard" },
  { href: "/calendar/", label: "Calendar" },
  { href: "/tickers/", label: "Tickers" },
  { href: "/signals/", label: "Signals" },
  { href: "/track-record/", label: "Track record" },
  { href: "/methodology/", label: "Methodology" },
];

function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg
        width={small ? 16 : 20}
        height={small ? 16 : 20}
        viewBox="0 0 20 20"
        aria-hidden
        className="drop-shadow-[0_0_6px_rgb(0_242_254_/_25%)]"
      >
        <rect
          x="0.5"
          y="0.5"
          width="19"
          height="19"
          rx="4"
          fill="var(--l-panel)"
          stroke="rgb(0 242 254 / 40%)"
        />
        <rect x="4.5" y="10" width="2.6" height="6" rx="0.6" fill="var(--l-cheap)" />
        <rect x="8.7" y="5" width="2.6" height="11" rx="0.6" fill="var(--l-accent)" />
        <rect x="12.9" y="8" width="2.6" height="8" rx="0.6" fill="var(--l-cheap)" />
      </svg>
      <span className={`font-mono font-bold tracking-wider ${small ? "text-xs" : "text-sm"}`}>
        <span className="text-[var(--l-text)]">PRINT</span>
        <span className="text-[var(--l-accent)]">EARNINGS</span>
      </span>
    </span>
  );
}

function LandingNav() {
  return (
    <header className="fixed top-0 z-50 w-full border-b border-[var(--l-line)] bg-[#080b11]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="PrintEarnings home">
            <Brand />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded px-3 py-1.5 font-mono text-xs text-[var(--l-muted)] transition-colors hover:bg-[var(--l-panel)] hover:text-[var(--l-text)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link
          href="/dashboard/"
          className="pressable rounded-lg border border-[var(--l-accent)]/40 bg-[var(--l-accent)]/10 px-3.5 py-1.5 font-mono text-xs font-semibold text-[var(--l-accent)] transition-colors hover:bg-[var(--l-accent)]/20"
        >
          Open dashboard →
        </Link>
      </div>
    </header>
  );
}

function LandingFooter() {
  const links = [
    { href: "/methodology/", label: "Methodology" },
    { href: "/faq/", label: "FAQ" },
    { href: "/support/", label: "Support" },
    { href: "/disclaimer/", label: "Disclaimer" },
    { href: "/privacy/", label: "Privacy" },
    { href: "/terms/", label: "Terms" },
  ];
  return (
    <footer className="border-t border-[var(--l-line)] bg-[var(--l-base)] pt-8 pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-6 border-b border-[var(--l-line)] pb-6 md:flex-row md:items-center">
          <Brand small />
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs text-[var(--l-muted)]">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="transition-colors hover:text-[var(--l-accent)]"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col items-start justify-between gap-3 pt-6 text-xs text-[var(--l-subtle)] md:flex-row md:items-center">
          <p>Informational only, not financial advice.</p>
          <p className="shrink-0 font-mono">&copy; {new Date().getFullYear()} PrintEarnings</p>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function TrustLine({ tracked }: { tracked: number }) {
  return (
    <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-xs text-[var(--l-subtle)]">
      <span>
        <strong className="font-semibold text-[var(--l-text)]">{atLeast(tracked)}</strong>{" "}
        tickers tracked, any symbol searchable
      </span>
      <span className="text-[var(--l-line-strong)]">•</span>
      <Link href="/track-record/" className="text-[var(--l-accent)] hover:underline">
        Every call scored, misses included →
      </Link>
    </p>
  );
}

/** 612 -> "600+". A count that only grows, rounded down so the headline
 * figure doesn't tick every night and never overstates coverage. */
function atLeast(n: number): string {
  if (n < 100) return String(n);
  return `${Math.floor(n / 100) * 100}+`;
}

function Figure({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="p-3">
      <dd
        className="tnum font-mono text-2xl font-extrabold tracking-tight lg:text-3xl"
        style={{ color: tone ?? "var(--l-text)" }}
      >
        {value}
      </dd>
      <dt className="mt-1 font-mono text-xs tracking-wider text-[var(--l-subtle)] uppercase">
        {label}
      </dt>
    </div>
  );
}

function Pillar({
  n,
  title,
  body,
  children,
}: {
  n: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group flex flex-col justify-between rounded-2xl border border-[var(--l-line)] bg-[var(--l-card)] p-6 shadow-[0_10px_30px_rgb(0_0_0_/_45%)] transition-colors duration-300 hover:border-[var(--l-accent)]/40 sm:p-8">
      <div>
        <span className="font-mono text-[11px] font-semibold tracking-wider text-[var(--l-subtle)] uppercase">
          {n}
        </span>
        <h3 className="mt-1 text-lg font-bold text-[var(--l-text)]">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-[var(--l-muted)]">{body}</p>
      </div>
      <div className="mt-8 rounded-xl border border-[var(--l-line)] bg-[var(--l-surface)] p-4 font-mono text-xs">
        {children}
      </div>
    </div>
  );
}

function ImpliedVsTypical({ t }: { t: PreviewTicker }) {
  const max = Math.max(t.implied, t.typical ?? 0) || 1;
  const w = (v: number) => `${Math.max(4, (v / max) * 100)}%`;
  return (
    <>
      <p className="mb-3 text-[11px] text-[var(--l-subtle)]">
        {t.ticker}, reporting {formatDate(t.reportDate)}
      </p>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[var(--l-subtle)]">Priced in</span>
        <span className="tnum font-bold text-[var(--l-accent)]">{pctRange(t.implied)}</span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--l-panel)]">
        <div
          className="h-full rounded-full bg-[var(--l-accent)]"
          style={{ width: w(t.implied) }}
        />
      </div>
      {t.typical && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[var(--l-subtle)]">Typical move</span>
            <span className="tnum font-bold text-[var(--l-text)]">{pctRange(t.typical)}</span>
          </div>
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--l-panel)]">
            <div
              className="h-full rounded-full bg-[var(--l-muted)]"
              style={{ width: w(t.typical) }}
            />
          </div>
        </>
      )}
      <div className="flex items-center justify-between border-t border-[var(--l-line)] pt-2 text-[11px]">
        <span className="text-[var(--l-muted)]">Pricing reads</span>
        <VerdictChip verdict={t.verdict} />
      </div>
    </>
  );
}

function HistoryStrip({ t }: { t: PreviewTicker }) {
  const n = t.moves.length;
  const outside = countOutside(t);
  const max = Math.max(...t.moves.map((m) => Math.abs(m.move)), t.implied) || 1;
  return (
    <>
      <div className="mb-2 flex items-center justify-between text-[11px] text-[var(--l-subtle)]">
        <span>
          {t.ticker}, last {n} prints
        </span>
        <span className="font-bold text-[var(--l-text)]">
          {outside} beyond {pctRange(t.implied)}
        </span>
      </div>
      <div className="flex h-12 items-end gap-1.5">
        {t.moves.map((m) => {
          const beyond = Math.abs(m.move) > t.implied;
          return (
            <div
              key={m.date}
              title={`${formatDate(m.date)}: ${(m.move * 100).toFixed(1)}%`}
              className={`flex-1 rounded ${beyond ? "bg-[var(--l-outside)]" : "bg-[var(--l-accent-soft)]/45"}`}
              style={{ height: `${Math.max(12, (Math.abs(m.move) / max) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-[var(--l-line)] pt-2 text-[10px] text-[var(--l-subtle)]">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[var(--l-accent-soft)]/60" /> Inside
          today&rsquo;s price
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[var(--l-outside)]" /> Moved more
        </span>
      </div>
    </>
  );
}

/**
 * Pillar 3's proof. Mirrors the track record page's rule: the sell and buy
 * halves are shown separately and never blended, since they point in
 * opposite directions and one averaged number would describe neither.
 */
function TrackRecordCard({ record }: { record: TrackRecordPage }) {
  const wrong =
    typeof record.correct === "number" && typeof record.directional === "number"
      ? record.directional - record.correct
      : null;
  const sell = record.structure_sell_avg_pnl_pct ?? null;
  const buy = record.structure_buy_avg_pnl_pct ?? null;
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--l-subtle)]">Rich / cheap calls</span>
        <span className="text-[10px] font-semibold text-[var(--l-accent)]">
          {record.scored} prints scored
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg border border-[var(--l-line)] bg-[var(--l-panel)]">
          <span className="text-[10px] text-[var(--l-subtle)]">RIGHT</span>
          <span className="text-sm font-bold text-[var(--l-cheap)]">{record.correct}</span>
        </div>
        <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg border border-[var(--l-line)] bg-[var(--l-panel)]">
          <span className="text-[10px] text-[var(--l-subtle)]">WRONG</span>
          <span className="text-sm font-bold text-[var(--l-rich)]">{wrong ?? ""}</span>
        </div>
        <div className="flex-1 pl-1">
          <div className="text-[11px] text-[var(--l-subtle)]">Accuracy</div>
          <div className="text-base font-bold text-[var(--l-text)]">
            {typeof record.accuracy === "number" ? pct(record.accuracy, 0) : "Not enough data"}
          </div>
        </div>
      </div>
      {(record.excluded_far_expiry ?? 0) > 0 && (
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--l-muted)]">
          Restated Sep 2026: {record.excluded_far_expiry} calls measured off a far expiry no
          longer count.{" "}
          <Link href="/track-record/" className="text-[var(--l-accent)] hover:underline">
            Why →
          </Link>
        </p>
      )}
      {sell !== null && buy !== null && (
        <div className="mt-3 border-t border-[var(--l-line)] pt-2.5">
          <p className="text-[11px] font-semibold text-[var(--l-text)]">
            {buy > sell
              ? "Rare CHEAP calls did the heavy lifting."
              : "Selling RICH premium carried the results."}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-md border border-[var(--l-line)] bg-[var(--l-panel)] px-2 py-1.5">
              <div className="text-[var(--l-subtle)]">
                Buying CHEAP · {record.structure_buy_scored}
              </div>
              <div className="text-sm font-bold text-[var(--l-cheap)]">
                {pctSigned(buy)} avg
              </div>
            </div>
            <div className="rounded-md border border-[var(--l-line)] bg-[var(--l-panel)] px-2 py-1.5">
              <div className="text-[var(--l-subtle)]">
                Selling RICH · {record.structure_sell_scored}
              </div>
              <div className="text-sm font-bold text-[var(--l-text)]">
                {pctSigned(sell)} avg
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--l-muted)]">
            Priced as real trades. Shown separately, never blended.
          </p>
        </div>
      )}
    </>
  );
}
