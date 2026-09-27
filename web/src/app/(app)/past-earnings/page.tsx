import { PastEarningsTable } from "@/components/PastEarningsTable";
import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex, getPastEarnings, getTrackRecord } from "@/lib/api";

export const metadata = { title: "Past earnings | PrintEarnings" };

/**
 * Every past earnings report across the whole tracked universe, newest first
 * — the cross-ticker counterpart to the per-ticker history table on /t/[ticker].
 * Capped server-side at 300 rows (api/app/routers.py::PAST_EARNINGS_LIMIT),
 * paged client-side (PastEarningsTable) so it reads as a scannable archive
 * rather than one endless scroll.
 */
export default async function PastEarningsPage() {
  const [index, data, record] = await Promise.all([
    getIndex(),
    getPastEarnings(),
    getTrackRecord(),
  ]);

  return (
    <>
      <TopBar title="Past earnings" eyebrow="Every tracked report" tickers={index.tickers} />

      <div className="px-6 py-6">
        <Panel
          title="History"
          bodyClassName="px-0 py-0"
          empty={data.rows.length === 0 ? "No earnings history recorded yet." : undefined}
        >
          <PastEarningsTable rows={data.rows} showDirection={record.direction_earned} />
        </Panel>
      </div>
    </>
  );
}
