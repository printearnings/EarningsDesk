import { Suspense } from "react";

import { getIndex } from "@/lib/api";
import { TopBar } from "@/components/TopBar";

import { LookupClient } from "./LookupClient";

export const metadata = { title: "Look up a ticker — EarningsDesk" };

/**
 * Cold-ticker lookup: server shell + client-fetched body.
 *
 * Static export can only pre-render pages for the tracked universe — there is
 * no server at request time to render a page for an arbitrary symbol. This
 * route is the workaround: a single static page whose content is fetched at
 * runtime, in the browser, from the Worker's free `/api/lookup` endpoint. It
 * is what makes "search any stock" true rather than "search these 40 stocks."
 */
export default async function LookupPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="Look up a ticker" eyebrow="Live lookup" tickers={index.tickers} />
      {/* useSearchParams requires a Suspense boundary during static prerendering. */}
      <Suspense
        fallback={<div className="px-6 py-6 text-sm text-[var(--color-muted)]">Loading…</div>}
      >
        <LookupClient trackedTickers={index.tickers.map((t) => t.ticker)} />
      </Suspense>
    </>
  );
}
