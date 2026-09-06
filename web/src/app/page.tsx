import Link from "next/link";

import { AuroraBackground } from "@/components/AuroraBackground";
import { Footer } from "@/components/Footer";
import { Logo } from "@/components/Logo";
import { TickerSearch } from "@/components/TickerSearch";
import { getCalendar, getIndex } from "@/lib/api";
import { formatDateShort, pctRange } from "@/lib/format";

export const metadata = {
  title: "PrintEarnings | Implied move vs. history",
};

/**
 * Search-first landing.
 *
 * The whole page exists to get someone to a ticker in one action, so the
 * search is the hero and everything else is secondary. No signup, no feature
 * grid: there is nothing to sign up for, and a trader who lands here already
 * knows what they came to look up.
 *
 * The dark band is the source design system's own marketing treatment —
 * solid color-block, not a gradient. It frames content between brand bands
 * rather than using photography. --color-band is scoped to marketing
 * surfaces like this one; every other panel/button stays on white/cream.
 *
 * The flat band reads a little static as a hero, so it carries one subtle
 * animated layer underneath the text: `AuroraBackground`, three large,
 * heavily blurred blobs of brand blue drifting slowly behind the content —
 * after two more literal attempts (a price-line texture, then a flickering
 * dot grid) both read as too busy for a serious data product's hero, this
 * goes quieter: ambient light, not a pattern. Freezes to its resting
 * position under `prefers-reduced-motion`.
 *
 * This page lives outside the (app) route group (no sidebar chrome), so it
 * doesn't inherit that layout's Footer — rendered explicitly here instead,
 * since the legal links belong on every page a first-time visitor can land
 * on, not just once they're past the dashboard.
 */
export default async function LandingPage() {
  const [index, calendar] = await Promise.all([getIndex(), getCalendar(14)]);
  const soonest = calendar.entries.slice(0, 6);

  return (
    <main>
      <section className="relative overflow-hidden" style={{ background: "var(--color-band)" }}>
        <AuroraBackground className="absolute inset-0" />
        {/* Fades the glow out toward the bottom edge so it recedes into the
            band rather than cutting off hard at the section boundary. */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, transparent 55%, var(--color-band) 100%)",
          }}
          aria-hidden
        />
        <div className="relative z-10 mx-auto max-w-[1280px] px-6 py-20 sm:py-28">
          <Logo size="lg" onBrand />

          <h1 className="display mt-6 max-w-3xl text-5xl !text-[var(--color-on-brand)] sm:text-6xl">
            Know what&rsquo;s priced in
            <br />
            before the print.
          </h1>

          <p className="mt-5 max-w-xl text-lg text-[var(--color-on-brand-muted)]">
            What the options market expects from the report, next to how the stock has actually
            moved its last eight quarters. The data and the read &mdash; you make the call.
          </p>

          <div className="mt-8 max-w-xl">
            <TickerSearch
              tickers={index.tickers}
              placeholder="Search a ticker, e.g. NVDA"
              size="lg"
            />
          </div>

          {soonest.length > 0 && (
            <div className="mt-6">
              <p className="eyebrow !text-[var(--color-on-brand-muted)]">Reporting soon</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {soonest.map((entry) => (
                  <li key={`${entry.ticker}-${entry.report_date}`}>
                    <Link
                      href={`/t/${entry.ticker}/`}
                      className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-white/15 px-3 py-2 transition-colors hover:border-white/40"
                    >
                      <span className="font-mono text-sm font-medium text-[var(--color-on-brand)]">
                        {entry.ticker}
                      </span>
                      <span className="tnum text-sm text-[var(--color-on-brand-muted)]">
                        {pctRange(entry.implied_move)}
                      </span>
                      <span className="text-sm text-[var(--color-on-brand-muted)]">
                        {formatDateShort(entry.report_date)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-8">
            <Link
              href="/dashboard/"
              className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-on-brand)] px-5 py-2.5 text-sm font-semibold text-[var(--color-brand)] transition-colors hover:bg-white"
            >
              Explore for free
              <span aria-hidden>→</span>
            </Link>
          </p>
        </div>

        {/* A wavy handoff into the cream page instead of a hard horizontal
            edge — the shape is the cream color painted over the navy band's
            bottom slice, so it reads as the page curving up into the band
            rather than a seam between two rectangles. preserveAspectRatio
            ="none" lets it stretch to any section width without distorting
            into visibly different curves at different viewport sizes. */}
        <svg
          className="absolute right-0 bottom-0 left-0 h-12 w-full sm:h-16"
          viewBox="0 0 1440 64"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d="M0,32 C240,58 480,6 720,20 C960,34 1200,58 1440,28 L1440,64 L0,64 Z"
            fill="var(--color-page)"
          />
        </svg>
      </section>

      <section className="mx-auto max-w-[1280px] px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-3">
          <Explainer
            label="Implied vs typical"
            body="Every ticker page compares the priced-in move against what this stock does after earnings, flagging when the premium is unusual."
          />
          <Explainer
            label="Eight quarters of history"
            body="EPS estimate against actual, the gap on the open and whether it filled, and the volume spike. The pattern, not just the last print."
          />
          <Explainer
            label="Scored, not asserted"
            body="Every call is checked against the outcome and kept on a public track record. Accuracy is withheld until the sample is large enough to mean anything."
          />
        </div>

        <p className="mt-14 max-w-3xl border-t border-[var(--color-border)] pt-6 text-sm text-[var(--color-muted)]">
          <strong className="font-medium text-[var(--color-body)]">
            Not financial advice.
          </strong>{" "}
          PrintEarnings reports what the options market is pricing, how a stock has behaved
          around past earnings, and a flow-and-sentiment directional read. It does not predict
          outcomes. Past behavior does not constrain the next print.
        </p>
      </section>

      <Footer />
    </main>
  );
}

function Explainer({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-[var(--color-body)]">{body}</p>
    </div>
  );
}
