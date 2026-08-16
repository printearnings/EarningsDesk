import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";

export const metadata = { title: "Methodology | EarningsDesk" };

export default async function MethodologyPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="Methodology" eyebrow="How this works" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <Panel title="Implied move">
          <p className="max-w-3xl text-[var(--color-body)]">
            The at-the-money straddle for the first options expiry covering the earnings date:
            call plus put, divided by stock price. This is what the options market charges to be
            on the right side of the move, a market estimate of the move&rsquo;s size, not a
            prediction of its direction.
          </p>
        </Panel>

        <Panel title="Rich, cheap, and fair">
          <p className="max-w-3xl text-[var(--color-body)]">
            The implied move is compared against this stock&rsquo;s own average absolute move
            after its last eight earnings reports. Priced meaningfully above that average is{" "}
            <strong className="font-medium text-[var(--color-heading)]">RICH</strong>;
            meaningfully below is{" "}
            <strong className="font-medium text-[var(--color-heading)]">CHEAP</strong>. Neither
            is a buy or sell signal on its own. It describes pricing, not direction; which side
            of that you want depends on the position you are building.
          </p>
        </Panel>

        <Panel title="Direction">
          <p className="max-w-3xl text-[var(--color-body)]">
            A separate, independent read blending options flow (the put/call ratio) with news
            sentiment. BULLISH or BEARISH describes where the flow leans, not whether the
            pricing looks rich or cheap. The two axes are scored and reported apart.
          </p>
        </Panel>

        <Panel title="What gets withheld">
          <p className="max-w-3xl text-[var(--color-body)]">
            Hit rates are withheld until at least four scored calls exist for a given claim. A
            single correct call reads as 100% accuracy, a number not worth showing until there
            is enough sample behind it.
          </p>
        </Panel>

        <Panel title="Data freshness">
          <p className="max-w-3xl text-[var(--color-body)]">
            Every ticker page is served from a snapshot rebuilt once nightly, which keeps the
            site free to browse. Options figures are as of that run, never live on page load.
            The price chart&rsquo;s 1D and 5D views are the exception, drawn from a live feed at
            no options-market cost.
          </p>
        </Panel>
      </div>
    </>
  );
}
