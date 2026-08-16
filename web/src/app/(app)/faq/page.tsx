import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";

export const metadata = { title: "FAQ | EarningsDesk" };

export default async function FaqPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="FAQ" eyebrow="Common questions" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <Panel title="Is this financial advice?">
          <p className="max-w-3xl text-[var(--color-body)]">
            No. The verdict, the directional read, and the AI summary describe what the data
            says, not what to do about it. See the{" "}
            <a href="/disclaimer/" className="underline underline-offset-2">
              disclaimer
            </a>
            .
          </p>
        </Panel>

        <Panel title="Why don't I see an options panel for this ticker?">
          <p className="max-w-3xl text-[var(--color-body)]">
            Two different messages, two different reasons. &ldquo;Options data not yet
            captured&rdquo; means we haven&rsquo;t looked at this stock&rsquo;s options yet, so
            there&rsquo;s nothing to show. &ldquo;No listed options chain&rdquo; means we
            checked, and this stock genuinely has no weekly options market (common for
            thinly-traded names, some foreign stocks, and indices).
          </p>
        </Panel>

        <Panel title="Why is news missing for some tickers?">
          <p className="max-w-3xl text-[var(--color-body)]">
            News is free, unmetered data, so every ticker page fetches it fresh regardless of
            snapshot status. An empty result means that fetch failed (rate limit or outage on
            the source) or the ticker has no recent coverage.
          </p>
        </Panel>

        <Panel title="Why is Quarterly financials empty for some tickers?">
          <p className="max-w-3xl text-[var(--color-body)]">
            Financials come from SEC filings, which exist only for U.S. domestic filers. A
            foreign private issuer (most non-U.S. ADRs) files an annual 20-F instead of a
            quarterly 10-Q, so there is no quarterly filing to source. Not a bug, a fact about
            the filer.
          </p>
        </Panel>

        <Panel title="Why don't I see a directional read for every upcoming report?">
          <p className="max-w-3xl text-[var(--color-body)]">
            The directional call (BULLISH/BEARISH/NEUTRAL) starts computing a few days before a
            report, since options flow carries little signal earlier than that. It is also gated
            by a sanity check that withholds the call entirely if the underlying signals
            conflict. No badge means &ldquo;not enough signal yet,&rdquo; not a missing feature.
          </p>
        </Panel>

        <Panel title="How fresh is the data?">
          <p className="max-w-3xl text-[var(--color-body)]">
            Most of a ticker page (implied move, verdict, options flow) is a snapshot rebuilt
            once nightly; every page states its age. The exceptions: the price chart&rsquo;s
            1D/5D views and the news feed, both fetched live at no options-data cost.
          </p>
        </Panel>

        <Panel title="What if a ticker isn't one we track closely?">
          <p className="max-w-3xl text-[var(--color-body)]">
            Search works for any symbol. You get price, news, and financials the same as a
            closely-tracked name, without the historical signal track record. Options data is
            fetched live, on demand, instead of pre-updated daily.
          </p>
        </Panel>

        <Panel title="Is EarningsDesk free? Do I need an account?">
          <p className="max-w-3xl text-[var(--color-body)]">
            Free. No account, no sign-up. See{" "}
            <a href="/privacy/" className="underline underline-offset-2">
              Privacy
            </a>{" "}
            for the complete list of what is collected.
          </p>
        </Panel>

        <Panel title="Can I trade directly from this site?">
          <p className="max-w-3xl text-[var(--color-body)]">
            No. This is a research and information tool, not a broker. It does not place orders,
            hold funds, or connect to a brokerage account.
          </p>
        </Panel>
      </div>
    </>
  );
}
