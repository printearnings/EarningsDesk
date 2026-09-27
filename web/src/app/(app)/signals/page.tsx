import { CheapStoryCallout } from "@/components/CheapStory";
import { Panel } from "@/components/Panel";
import { SignalsTable } from "@/components/SignalsTable";
import { TopBar } from "@/components/TopBar";
import { getIndex, getSignals, getTrackRecord } from "@/lib/api";
import { directionNote } from "@/lib/insights";

export const metadata = { title: "Signals | PrintEarnings" };

/**
 * Every signal the engine has posted, newest run first — the receipts behind
 * the Track Record page's headline accuracy number. That number is only
 * worth trusting if every individual call behind it is inspectable, so each
 * row here carries its own Hit/Miss once the print has happened and been
 * scored — not just what was called, but whether it was right.
 *
 * A ticker can legitimately appear twice: once for the Workflow A (vol
 * rich/cheap) analysis and once for Workflow B (directional), often run on
 * different days. Deliberately NOT merged into one row — that would fold two
 * different analyses, run at different times, into a single timestamp and
 * misrepresent when each actually happened. The WorkflowChip makes the two
 * kinds visually unmistakable instead.
 */
export default async function SignalsPage() {
  const [index, signals, record] = await Promise.all([
    getIndex(),
    getSignals(),
    getTrackRecord(),
  ]);

  return (
    <>
      <TopBar title="Signals" eyebrow="Every call, scored" tickers={index.tickers} />

      <div className="space-y-6 px-6 py-6">
        <CheapStoryCallout record={record} />
        <Panel
          title="All signals"
          bodyClassName="px-0 py-0"
          empty={signals.rows.length === 0 ? "No signals recorded yet." : undefined}
        >
          <SignalsTable rows={signals.rows} directionNote={directionNote(record)} />
        </Panel>
      </div>
    </>
  );
}
