import { MonthCalendar } from "@/components/MonthCalendar";
import { Panel } from "@/components/Panel";
import { TopBar } from "@/components/TopBar";
import { getCalendarFull, getIndex } from "@/lib/api";

export const metadata = { title: "Calendar | PrintEarnings" };

export default async function CalendarPage() {
  const [index, calendar] = await Promise.all([getIndex(), getCalendarFull()]);

  return (
    <>
      <TopBar title="Calendar" eyebrow="Earnings calendar" tickers={index.tickers} />

      <div className="px-6 py-6">
        <Panel
          title="Earnings calendar"
          bodyClassName="px-0 py-0"
          empty={calendar.entries.length === 0 ? "No tracked earnings events yet." : undefined}
        >
          <MonthCalendar entries={calendar.entries} />
        </Panel>
      </div>
    </>
  );
}
