import { getIndex } from "@/lib/api";
import { TopBar } from "@/components/TopBar";

import { SimulatorLandingClient } from "./SimulatorLandingClient";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta(
  "Options P&L simulator",
  "/simulator/",
  "Model how a straddle or other options position around an earnings report could pay out across different moves.",
);

/**
 * The nav-level entry point for the simulator: pick any tracked ticker here
 * and the trade builder loads right on this page — no navigation to that
 * ticker's own /t/[ticker]/simulator/ page, and no separate "Load live
 * chain" click after the pick, since picking the ticker here already is
 * that decision. A cold (untracked) pick routes through /lookup/ instead,
 * same as everywhere else TickerSearch appears — an unconfirmed report date
 * has nothing to simulate.
 */
export default async function SimulatorLandingPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="Options Simulator" eyebrow="Tools" tickers={index.tickers} />
      <div className="px-6 py-6">
        <SimulatorLandingClient tickers={index.tickers} />
      </div>
    </>
  );
}
