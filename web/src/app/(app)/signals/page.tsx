import Link from "next/link";

import { DirectionChip, VerdictChip, WorkflowChip } from "@/components/Chip";
import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex, getSignals } from "@/lib/api";
import { formatDateShort, num, pctRange } from "@/lib/format";

export const metadata = { title: "Signals — EarningsDesk" };

/**
 * Every signal the engine has posted, newest run first — a chronological
 * activity log, not a per-event summary.
 *
 * A ticker can legitimately appear twice: once for the Workflow A (vol
 * rich/cheap) analysis and once for Workflow B (directional), often run on
 * different days. Deliberately NOT merged into one row — that would fold two
 * different analyses, run at different times, into a single timestamp and
 * misrepresent when each actually happened. The WorkflowChip makes the two
 * kinds visually unmistakable instead.
 */
export default async function SignalsPage() {
  const [index, signals] = await Promise.all([getIndex(), getSignals()]);

  return (
    <>
      <TopBar title="Signals" eyebrow="Activity feed" tickers={index.tickers} />

      <div className="px-6 py-6">
        <Panel
          title="All signals"
          subtitle={`${signals.rows.length} posted`}
          bodyClassName="px-0 py-0"
          empty={signals.rows.length === 0 ? "No signals recorded yet." : undefined}
        >
          <div className="overflow-x-auto">
            <table className="tnum w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] text-left">
                  {["Run date", "Ticker", "Report date", "Workflow", "Call", "Implied", "Edge"].map(
                    (h) => (
                      <th key={h} className="eyebrow px-5 py-2.5 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {signals.rows.map((row) => (
                  <tr
                    key={`${row.ticker}-${row.run_date}-${row.workflow}`}
                    className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                  >
                    <td className="px-5 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                      {formatDateShort(row.run_date)}
                    </td>
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/t/${row.ticker}/`}
                        className="font-mono font-medium text-[var(--color-heading)] hover:underline"
                      >
                        {row.ticker}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                      {formatDateShort(row.report_date)}
                    </td>
                    <td className="px-5 py-2.5">
                      <WorkflowChip workflow={row.workflow} />
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="flex gap-1.5">
                        <VerdictChip verdict={row.verdict} />
                        <DirectionChip direction={row.direction} />
                      </span>
                    </td>
                    <td className="px-5 py-2.5">{pctRange(row.implied_move)}</td>
                    <td className="px-5 py-2.5">{num(row.edge_score, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
