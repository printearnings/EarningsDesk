import Link from "next/link";

import { VerdictChip, SessionChip } from "@/components/Chip";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";
import { EMPTY, money, pctRange, relativeDaysFromDate } from "@/lib/format";

export const metadata = { title: "Tickers — EarningsDesk" };

/**
 * Every tracked ticker, browsable without knowing to search first — for
 * someone who just wants to look at a stock, not hunt for a calendar entry or
 * remember a symbol. One row surfaces enough to be useful (price, verdict,
 * next report); the full picture is one click away on the ticker page.
 */
export default async function TickersPage() {
  const index = await getIndex();
  const tickers = [...index.tickers].sort((a, b) => a.ticker.localeCompare(b.ticker));

  return (
    <>
      <TopBar title="Tickers" eyebrow={`${tickers.length} tracked`} tickers={index.tickers} />

      <div className="px-6 py-6">
        <Panel
          title="All tickers"
          bodyClassName="px-0 py-0"
          empty={tickers.length === 0 ? "No tracked tickers yet." : undefined}
        >
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tickers.map((t) => (
              <li
                key={t.ticker}
                className="border-r border-b border-[var(--color-border-subtle)] [&:nth-child(4n)]:border-r-0"
              >
                <Link
                  href={`/t/${t.ticker}/`}
                  className="flex flex-col gap-1.5 px-4 py-3 transition-colors hover:bg-[var(--color-panel-soft)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <CompanyLogo ticker={t.ticker} domain={t.company_domain} size={18} />
                      <span className="font-mono text-sm font-medium text-[var(--color-heading)]">
                        {t.ticker}
                      </span>
                    </span>
                    <VerdictChip verdict={t.verdict} />
                  </div>

                  {t.company_name && (
                    <p className="text-2xs truncate text-[var(--color-muted)]">
                      {t.company_name}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span className="tnum text-[var(--color-body)]">{money(t.spot)}</span>
                    <span className="tnum text-[var(--color-muted)]">
                      {pctRange(t.implied_move)}
                    </span>
                  </div>

                  <div className="text-2xs flex items-center gap-1.5 text-[var(--color-muted)]">
                    {t.next_report_date ? (
                      <>
                        <SessionChip session={t.next_report_session} />
                        {relativeDaysFromDate(t.next_report_date)}
                      </>
                    ) : (
                      EMPTY
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
