import Link from "next/link";

import { DirectionChip, SessionChip, VerdictChip } from "@/components/Chip";
import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex, getPastEarnings } from "@/lib/api";
import { eps, formatDateShort, pctRange, pctRaw, pctSigned, ratio } from "@/lib/format";

export const metadata = { title: "Past earnings — EarningsDesk" };

/**
 * Every past earnings report across the whole tracked universe, newest first
 * — the cross-ticker counterpart to the per-ticker history table on /t/[ticker].
 * Capped server-side at 300 rows (api/app/routers.py::PAST_EARNINGS_LIMIT);
 * this is a feed to scan, not a paginated archive.
 */
export default async function PastEarningsPage() {
  const [index, data] = await Promise.all([getIndex(), getPastEarnings()]);

  return (
    <>
      <TopBar title="Past earnings" eyebrow="Every tracked report" tickers={index.tickers} />

      <div className="px-6 py-6">
        <Panel
          title="History"
          subtitle={`${data.rows.length} reports`}
          bodyClassName="px-0 py-0"
          empty={data.rows.length === 0 ? "No earnings history recorded yet." : undefined}
        >
          <div className="overflow-x-auto">
            <table className="tnum w-full min-w-[54rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] text-left">
                  {[
                    "Date",
                    "Ticker",
                    "EPS est",
                    "EPS actual",
                    "Surprise",
                    "Implied",
                    "Actual",
                    "Gap",
                    "Volume",
                    "Call",
                  ].map((h) => (
                    <th key={h} className="eyebrow px-4 py-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={`${r.ticker}-${r.report_date}`}
                    className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                      {formatDateShort(r.report_date)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/t/${r.ticker}/`}
                        className="inline-flex items-center gap-2 font-mono font-medium text-[var(--color-heading)] hover:underline"
                      >
                        {r.ticker}
                        <SessionChip session={r.session} />
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{eps(r.eps_estimate)}</td>
                    <td className="px-4 py-2.5">{eps(r.eps_actual)}</td>
                    <td
                      className={`px-4 py-2.5 ${
                        typeof r.eps_surprise === "number"
                          ? r.eps_surprise >= 0
                            ? "text-[var(--color-positive)]"
                            : "text-[var(--color-negative)]"
                          : ""
                      }`}
                    >
                      {pctRaw(r.eps_surprise)}
                    </td>
                    <td className="px-4 py-2.5">{pctRange(r.implied_move)}</td>
                    <td className="px-4 py-2.5">{pctSigned(r.realized_move)}</td>
                    <td className="px-4 py-2.5">
                      {pctSigned(r.gap_open_pct)}
                      {r.gap_filled === true && (
                        <span className="ml-1.5 font-mono text-[var(--text-2xs)] uppercase tracking-[0.06em] text-[var(--color-muted)]">
                          filled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{ratio(r.vol_ratio, 1)}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex gap-1.5">
                        <VerdictChip verdict={r.verdict} />
                        <DirectionChip direction={r.direction} />
                      </span>
                    </td>
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
