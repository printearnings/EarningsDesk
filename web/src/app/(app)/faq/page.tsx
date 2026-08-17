import type { ReactNode } from "react";

import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";

export const metadata = { title: "FAQ | PrintEarnings" };

const QA: { question: string; answer: ReactNode }[] = [
  {
    question: "Is this financial advice?",
    answer: (
      <>
        No. The verdict, the directional read, and the AI summary describe what the data says,
        not what to do about it. See the{" "}
        <a href="/disclaimer/" className="underline underline-offset-2">
          disclaimer
        </a>
        .
      </>
    ),
  },
  {
    question: "Why don't I see an options panel for this ticker?",
    answer: (
      <>
        Two different messages, two different reasons. &ldquo;Options data not yet
        captured&rdquo; means we haven&rsquo;t looked at this stock&rsquo;s options yet, so
        there&rsquo;s nothing to show. &ldquo;No listed options chain&rdquo; means we checked,
        and this stock genuinely has no weekly options market (common for thinly-traded names,
        some foreign stocks, and indices).
      </>
    ),
  },
  {
    question: "Why is news missing for some tickers?",
    answer:
      "News is free, unmetered data, so every ticker page fetches it fresh regardless of snapshot status. An empty result means that fetch failed (rate limit or outage on the source) or the ticker has no recent coverage.",
  },
  {
    question: "Why is Quarterly financials empty for some tickers?",
    answer:
      "Financials come from SEC filings, which exist only for U.S. domestic filers. A foreign private issuer (most non-U.S. ADRs) files an annual 20-F instead of a quarterly 10-Q, so there is no quarterly filing to source. Not a bug, a fact about the filer.",
  },
  {
    question: "Why don't I see a directional read for every upcoming report?",
    answer:
      "The directional call (BULLISH/BEARISH/NEUTRAL) starts computing a few days before a report, since options flow carries little signal earlier than that. It is also gated by a sanity check that withholds the call entirely if the underlying signals conflict. No badge means “not enough signal yet,” not a missing feature.",
  },
  {
    question: "How fresh is the data?",
    answer:
      "Most of a ticker page (implied move, verdict, options flow) is a snapshot rebuilt once nightly; every page states its age. The exceptions: the price chart's 1D/5D views and the news feed, both fetched live at no options-data cost.",
  },
  {
    question: "What if a ticker isn't one we track closely?",
    answer:
      "Search works for any symbol. You get price, news, and financials the same as a closely-tracked name, without the historical signal track record. Options data is fetched live, on demand, instead of pre-updated daily.",
  },
  {
    question: "Is PrintEarnings free? Do I need an account?",
    answer: (
      <>
        Free. No account, no sign-up. See{" "}
        <a href="/privacy/" className="underline underline-offset-2">
          Privacy
        </a>{" "}
        for the complete list of what is collected.
      </>
    ),
  },
  {
    question: "Can I trade directly from this site?",
    answer:
      "No. This is a research and information tool, not a broker. It does not place orders, hold funds, or connect to a brokerage account.",
  },
];

/**
 * One `<details>` per question rather than a client accordion component —
 * expand/collapse, keyboard toggling, and even in-page find-on-open are all
 * native browser behavior, so a static export gets a working accordion with
 * zero JS. `group-open:rotate-180` on the chevron is the only thing that
 * needs `group` on the `<details>` itself.
 */
export default async function FaqPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="FAQ" eyebrow="Common questions" tickers={index.tickers} />

      <div className="px-6 py-6">
        <Panel title="Common questions" bodyClassName="px-0 py-0">
          <div>
            {QA.map((qa) => (
              <details
                key={qa.question}
                className="group border-b border-[var(--color-border-subtle)] last:border-b-0"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 text-sm font-medium text-[var(--color-heading)] transition-colors group-open:bg-[var(--color-table-head)] group-open:text-[var(--color-brand)] hover:bg-[var(--color-panel-soft)] sm:px-5 [&::-webkit-details-marker]:hidden">
                  {qa.question}
                  <ChevronDownIcon className="shrink-0 text-[var(--color-brand)] transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] group-open:rotate-180" />
                </summary>
                <p className="px-4 pb-4 text-sm text-[var(--color-body)] sm:max-w-3xl sm:px-5">
                  {qa.answer}
                </p>
              </details>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M3.5 6l4.5 5 4.5-5" />
    </svg>
  );
}
