import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";
import { DISCLAIMER_PARAGRAPHS } from "@/lib/legal";

export const metadata = { title: "Disclaimer | EarningsDesk" };

export default async function DisclaimerPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="Disclaimer" eyebrow="Read this first" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <Panel title="Not financial advice">
          <div className="max-w-3xl space-y-3 text-[var(--color-body)]">
            {DISCLAIMER_PARAGRAPHS.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
        </Panel>

        <Panel title="What the numbers actually are">
          <p className="max-w-3xl text-[var(--color-body)]">
            The implied-move verdict (RICH/CHEAP/FAIR) describes options pricing against this
            stock&rsquo;s own history. It is not a signal to buy or sell. The directional read
            (BULLISH/BEARISH/NEUTRAL) blends options flow and sentiment into a lean, refined
            daily as a report approaches. It is a probabilistic read to size around, not a
            prediction. See{" "}
            <a href="/methodology/" className="underline underline-offset-2">
              Methodology
            </a>{" "}
            for exactly how each is computed.
          </p>
        </Panel>

        <Panel title="Data sources and freshness">
          <p className="max-w-3xl text-[var(--color-body)]">
            Prices, options, and financials come from third-party data providers and can be
            delayed, incomplete, or wrong. Most ticker pages are served from a snapshot rebuilt
            once nightly, not live on page load. The page always states how old the data is.
          </p>
        </Panel>
      </div>
    </>
  );
}
