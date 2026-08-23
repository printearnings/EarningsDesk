import { Suspense } from "react";

import { getIndex } from "@/lib/api";
import { TopBar } from "@/components/TopBar";

import { CalendarDayClient } from "./CalendarDayClient";

export const metadata = { title: "Day view | PrintEarnings" };

/**
 * The month grid caps each cell at a few tickers before folding the rest
 * into "+N more" — a day with 20+ reporters (common during peak season)
 * would otherwise blow out every row's height. This is where that
 * overflow goes: every reporter for one date, unclipped.
 *
 * Static shell + client-fetched body, same shape as the ticker-lookup page:
 * `date` only exists in the query string, and static export has no server
 * at request time to read it, so the actual list has to resolve in the
 * browser. See CalendarDayClient / useCalendarEntries.
 */
export default async function CalendarDayPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar title="Day view" eyebrow="Earnings calendar" tickers={index.tickers} />
      {/* useSearchParams requires a Suspense boundary during static prerendering. */}
      <Suspense
        fallback={<div className="px-6 py-6 text-sm text-[var(--color-muted)]">Loading…</div>}
      >
        <CalendarDayClient />
      </Suspense>
    </>
  );
}
