"use client";

import { useState } from "react";

import { OptionsSimulator } from "@/components/OptionsSimulator";
import { Panel } from "@/components/Panel";
import { TickerSearch } from "@/components/TickerSearch";
import type { TickerIndexEntry } from "@/lib/types";

interface Picked {
  ticker: string;
  nextReportDate: string | null;
  nextReportSession: string | null;
}

/**
 * Renders the trade builder inline for whichever ticker gets picked, rather
 * than routing to that ticker's own /t/[ticker]/simulator/ page. Two things
 * that navigation cost: an extra page load the user didn't ask for, and the
 * "Load live chain" click landing on that page still required even though
 * picking a ticker here already *is* the explicit "load this" action. `key`
 * on OptionsSimulator remounts it fresh (state and all) whenever the pick
 * changes, instead of teaching the component to reset an existing instance.
 */
export function SimulatorLandingClient({ tickers }: { tickers: TickerIndexEntry[] }) {
  const [picked, setPicked] = useState<Picked | null>(null);

  if (!picked) {
    return (
      <Panel title="Earnings-day options P&L simulator">
        <div className="mx-auto max-w-md py-8">
          <TickerSearch
            tickers={tickers}
            placeholder="Search a ticker to simulate"
            size="lg"
            autoFocus
            onSelectTracked={setPicked}
          />
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setPicked(null)}
        className="pressable text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-heading)]"
      >
        ← Choose a different ticker
      </button>
      <OptionsSimulator
        key={picked.ticker}
        ticker={picked.ticker}
        reportDate={picked.nextReportDate}
        reportSession={picked.nextReportSession}
        autoLoad
      />
    </div>
  );
}
