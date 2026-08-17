import { getIndex } from "@/lib/api";
import { Panel } from "@/components/Panel";
import { TickerSearch } from "@/components/TickerSearch";
import { TopBar } from "@/components/TopBar";

export const metadata = { title: "Options P&L simulator | PrintEarnings" };

/**
 * The nav-level entry point for the simulator: pick any tracked ticker here
 * and land straight on its /t/[ticker]/simulator/ page, rather than only
 * being reachable by first opening a specific ticker's Options tab. A cold
 * (untracked) pick routes through /lookup/ instead, same as everywhere else
 * TickerSearch appears — an unconfirmed report date has nothing to simulate.
 */
export default async function SimulatorLandingPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="Options Simulator" eyebrow="Tools" tickers={index.tickers} />
      <div className="px-6 py-6">
        <Panel
          title="Earnings-day options P&L simulator"
          subtitle="Pick a ticker to build a single-leg call or put and see its payoff at expiration and the day after the print, re-priced with Black-Scholes."
        >
          <div className="mx-auto max-w-md py-8">
            <TickerSearch
              tickers={index.tickers}
              placeholder="Search a ticker to simulate"
              size="lg"
              destination="simulator"
              autoFocus
            />
          </div>
        </Panel>
      </div>
    </>
  );
}
