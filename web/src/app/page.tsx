import Link from "next/link";

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
 * The charcoal band is Vertical's marketing treatment — the system frames
 * content between brand bands rather than using photography.
 */
export default async function LandingPage() {
  const [index, calendar] = await Promise.all([getIndex(), getCalendar(14)]);
  const soonest = calendar.entries.slice(0, 6);

  return (
    <main>
      <section className="bg-[var(--color-brand)]">
        <div className="mx-auto max-w-[1280px] px-6 py-20 sm:py-28">
          <p className="eyebrow !text-[var(--color-on-brand-muted)]">PrintEarnings</p>

          <h1 className="display mt-4 max-w-3xl text-5xl !text-[var(--color-on-brand)] sm:text-6xl">
            Implied move vs. history,
            <br />
            before the print.
          </h1>

          <p className="mt-5 max-w-xl text-lg text-[var(--color-on-brand-muted)]">
            The move options are pricing into an earnings report, against what the stock did the
            last eight quarters.
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
              className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-on-brand)] px-4 py-2.5 text-sm font-medium text-[var(--color-brand)] transition-colors hover:bg-white"
            >
              Open the dashboard
              <span aria-hidden>→</span>
            </Link>
          </p>
        </div>
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
          PrintEarnings reports current options pricing and a stock&rsquo;s historical
          post-earnings behavior. It does not predict outcomes. Past behavior does not constrain
          the next print.
        </p>
      </section>
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
