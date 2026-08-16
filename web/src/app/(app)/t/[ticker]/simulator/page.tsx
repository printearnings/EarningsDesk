import Link from "next/link";
import { notFound } from "next/navigation";

import { OptionsSimulator } from "@/components/OptionsSimulator";
import { Eyebrow } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex, getTicker } from "@/lib/api";

/** Static export needs the full route list at build time — same universe
 * the parent /t/[ticker] page builds against. */
export async function generateStaticParams() {
  const index = await getIndex();
  return index.tickers.map((t) => ({ ticker: t.ticker }));
}

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} options simulator | PrintEarnings` };
}

export default async function SimulatorPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const [index, data] = await Promise.all([getIndex(), getTicker(ticker)]);
  if (!data) notFound();

  return (
    <>
      <TopBar
        title={`${data.ticker} · Simulator`}
        eyebrow="Options P&L"
        tickers={index.tickers}
      />

      <div className="space-y-4 px-6 py-6">
        <div>
          <Link
            href={`/t/${data.ticker}/?tab=options`}
            className="pressable text-2xs text-[var(--color-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-body)]"
          >
            ← Back to {data.ticker}
          </Link>
          <Eyebrow>Earnings-day options P&L simulator</Eyebrow>
        </div>

        <OptionsSimulator
          ticker={data.ticker}
          reportDate={data.next_report_date ?? null}
          reportSession={data.next_report_session ?? null}
        />
      </div>
    </>
  );
}
