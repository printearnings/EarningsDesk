import { CpiHistoryTable } from "@/components/CpiHistoryTable";
import { MacroCalendarList } from "@/components/MacroCalendarList";
import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getIndex } from "@/lib/api";
import { MACRO_EVENTS } from "@/lib/macroEvents";

export const metadata = { title: "Macro calendar | PrintEarnings" };

export default async function MacroCalendarPage() {
  const index = await getIndex();

  return (
    <>
      <TopBar
        title="Macro calendar"
        eyebrow="Fed, inflation & jobs schedule"
        tickers={index.tickers}
      />

      <div className="space-y-6 px-6 py-6">
        <Panel
          title="FOMC, CPI, PPI & jobs"
          subtitle="The macro dates that move every ticker at once, not just the one reporting that week"
          bodyClassName="px-0 py-0"
        >
          <MacroCalendarList events={MACRO_EVENTS} />
        </Panel>

        <CpiHistoryTable />

        <p className="text-sm text-[var(--color-muted)]">
          Dates from the Federal Reserve&rsquo;s published FOMC calendar and the BLS release
          schedules for CPI, PPI, and the Employment Situation. All are announced 12&ndash;18
          months out and rarely move, but always confirm against{" "}
          <a
            href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-body)]"
          >
            federalreserve.gov
          </a>{" "}
          and{" "}
          <a
            href="https://www.bls.gov/schedule/news_release/2026_sched.htm"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-[var(--color-body)]"
          >
            bls.gov
          </a>{" "}
          before trading around one.
        </p>
      </div>
    </>
  );
}
