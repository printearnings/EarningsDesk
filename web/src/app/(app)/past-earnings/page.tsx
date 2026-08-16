import { PastEarningsTable } from "@/components/PastEarningsTable";
import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex, getPastEarnings } from "@/lib/api";

export const metadata = { title: "Past earnings | EarningsDesk" };

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
          bodyClassName="px-0 py-0"
          empty={data.rows.length === 0 ? "No earnings history recorded yet." : undefined}
        >
          <PastEarningsTable rows={data.rows} />
        </Panel>
      </div>
    </>
  );
}
