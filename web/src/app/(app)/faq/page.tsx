import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";

export const metadata = { title: "FAQ — EarningsDesk" };

export default async function FaqPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="FAQ" eyebrow="Common questions" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <Panel title="Is this financial advice?">
          <p className="max-w-3xl text-[var(--color-body)]">
            No. Everything here — the verdict, the directional read, the AI summary — describes
            what the data says, not what to do about it. See the{" "}
            <a href="/disclaimer/" className="underline underline-offset-2">
              disclaimer
            </a>
            .
          </p>
        </Panel>

        <Panel title="Why don't I see an options panel for this ticker?">
          <p className="max-w-3xl text-[var(--color-body)]">
            Two different reasons read very differently. &ldquo;Options data hasn&rsquo;t been
            captured for this symbol yet&rdquo; means the nightly job hasn&rsquo;t taken a
            snapshot of it — usually because it&rsquo;s outside the tracked universe. &ldquo;No
            listed options chain&rdquo; means it was checked and this symbol genuinely has no
            weekly options market (common for thinly-traded names, some ADRs, and indices).
          </p>
        </Panel>

        <Panel title="Why is news missing for some tickers?">
          <p className="max-w-3xl text-[var(--color-body)]">
            It shouldn&rsquo;t usually be — news is free, unmetered data, so every ticker page
            fetches it fresh even without a snapshot. It only comes back empty if that specific
            fetch failed (a rate limit or an outage on the data source&rsquo;s end) or the
            ticker genuinely has no recent coverage.
          </p>
        </Panel>

        <Panel title="Why is Quarterly financials empty for some tickers?">
          <p className="max-w-3xl text-[var(--color-body)]">
            Financials come from SEC filings, which only exist for U.S. domestic filers. A
            foreign private issuer (most non-U.S. ADRs) files an annual 20-F instead of a
            quarterly 10-Q, so there&rsquo;s no quarterly SEC filing for this data to come from
            — not a bug, a fact about the filer.
          </p>
        </Panel>

        <Panel title="Why don't I see a directional read for every upcoming report?">
          <p className="max-w-3xl text-[var(--color-body)]">
            The directional call (BULLISH/BEARISH/NEUTRAL) only starts computing a few days
            before a report — options flow doesn&rsquo;t carry a meaningful signal much earlier
            than that, and the read is validated against a sanity check that can withhold it
            entirely if the underlying signals conflict. No badge is a real answer (&ldquo;not
            enough signal yet&rdquo;), not a missing feature.
          </p>
        </Panel>

        <Panel title="How fresh is the data?">
          <p className="max-w-3xl text-[var(--color-body)]">
            Most of a ticker page — implied move, verdict, options flow — is a snapshot rebuilt
            once nightly; every page states exactly how old it is. The price chart&rsquo;s 1D/5D
            views and the news feed are the exceptions: those are fetched live, at no
            options-data cost.
          </p>
        </Panel>

        <Panel title="What if a ticker isn't in the tracked universe?">
          <p className="max-w-3xl text-[var(--color-body)]">
            Search still works for any symbol — you&rsquo;ll get price, news, and financials the
            same as a tracked name, just without the historical signal track record or a nightly
            snapshot (options data is fetched live, on demand, instead).
          </p>
        </Panel>

        <Panel title="Is EarningsDesk free? Do I need an account?">
          <p className="max-w-3xl text-[var(--color-body)]">
            Free, no account, no sign-up. See{" "}
            <a href="/privacy/" className="underline underline-offset-2">
              Privacy
            </a>{" "}
            for exactly what (very little) is collected.
          </p>
        </Panel>

        <Panel title="Can I trade directly from this site?">
          <p className="max-w-3xl text-[var(--color-body)]">
            No — this is a research and information tool, not a broker. It doesn&rsquo;t place
            orders, hold funds, or connect to a brokerage account.
          </p>
        </Panel>
      </div>
    </>
  );
}
