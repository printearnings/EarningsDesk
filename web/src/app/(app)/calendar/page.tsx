import { EarningsCalendar } from "@/components/calendar/EarningsCalendar";
import type { Names } from "@/components/calendar/shared";
import { TopBar } from "@/components/TopBar";
import { getCalendarFull, getIndex, getTrackRecord } from "@/lib/api";

export const metadata = { title: "Earnings calendar | PrintEarnings" };

export default async function CalendarPage() {
  const [index, calendar, record] = await Promise.all([
    getIndex(),
    getCalendarFull(),
    getTrackRecord(),
  ]);

  // Company names for the list and day panel. Only what the calendar
  // actually references ships to the browser.
  const onCalendar = new Set(calendar.entries.map((e) => e.ticker));
  const names: Names = Object.fromEntries(
    index.tickers
      .filter((t) => onCalendar.has(t.ticker))
      .map((t) => [
        t.ticker,
        { name: t.company_name ?? null, domain: t.company_domain ?? null },
      ]),
  );

  return (
    <>
      <TopBar title="Earnings calendar" eyebrow="Calendar" tickers={index.tickers} />

      <div className="px-6 py-6">
        {calendar.entries.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No tracked earnings events yet.</p>
        ) : (
          <EarningsCalendar
            entries={calendar.entries}
            names={names}
            asOf={String(calendar.as_of)}
            showDirection={record.direction_earned}
          />
        )}
      </div>
    </>
  );
}
