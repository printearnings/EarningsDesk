import { Panel } from "@/components/Panel";
import { TickersScreener } from "@/components/TickersScreener";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";

export const metadata = { title: "Tickers | EarningsDesk" };

/**
 * The screener: every tracked ticker, sorted by how soon it reports —
 * "what's coming up, and is it worth a look" is the question this page
 * answers, not "let me find one name alphabetically" (the search box in the
 * top bar already does that). See TickersScreener for the rest of the
 * reasoning.
 */
export default async function TickersPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar
        title="Tickers"
        eyebrow={`${index.tickers.length} tracked`}
        tickers={index.tickers}
      />

      <div className="px-6 py-6">
        <Panel
          title="Screener"
          subtitle="Every tracked name, soonest report first — filter by verdict to find what's mispriced"
          bodyClassName="px-0 py-0"
          empty={index.tickers.length === 0 ? "No tracked tickers yet." : undefined}
        >
          <TickersScreener tickers={index.tickers} />
        </Panel>
      </div>
    </>
  );
}
