export type MacroEventType = "FOMC" | "CPI" | "PPI" | "JOBS";

export interface MacroEvent {
  /** ISO date of the market-moving day itself — the FOMC decision/press
   * conference day (not the first day of a 2-day meeting), or the release
   * day for a data print (CPI, PPI, or the jobs report). */
  date: string;
  type: MacroEventType;
  label: string;
  /** Release/announcement time, Eastern. */
  time: string;
  /** FOMC only — first day of the associated 2-day meeting, for display as
   * a range ("Sep 15-16"). Omitted for CPI, which is a single-day release. */
  meetingStart?: string;
  /** FOMC only — whether this meeting carries a Summary of Economic
   * Projections (the quarterly dot plot). */
  hasProjections?: boolean;
}

/**
 * Sourced from the Federal Reserve's published FOMC calendar
 * (federalreserve.gov/monetarypolicy/fomccalendars.htm) and the BLS release
 * schedules for CPI (bls.gov/schedule/news_release/cpi.htm), PPI
 * (.../ppi.htm), and the Employment Situation / jobs report
 * (.../empsit.htm) — FOMC/CPI fetched 2026-08-16, PPI/jobs 2026-09-05. The
 * Fed and BLS publish roughly 12-18 months out — this list needs a manual
 * refresh once they post dates beyond what's here, since neither publishes a
 * public API for it and scraping either page for ~50 dates a year isn't worth
 * the fragility.
 *
 * FOMC's date is the second (decision) day of the meeting — the day the
 * statement, and every 3rd meeting the Summary of Economic Projections,
 * actually drops. Every meeting since Jan 2019 has carried a press
 * conference, so that's assumed to continue rather than re-derived from the
 * Fed page's own listing (which only marks it explicitly for the nearer
 * meetings it has finalized room bookings for).
 */
export const MACRO_EVENTS: MacroEvent[] = [
  {
    date: "2026-01-28",
    type: "FOMC",
    label: "FOMC rate decision",
    time: "2:00 PM ET",
    meetingStart: "2026-01-27",
  },
  {
    date: "2026-02-13",
    type: "CPI",
    label: "CPI report: January 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-03-11",
    type: "CPI",
    label: "CPI report: February 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-03-18",
    type: "FOMC",
    label: "FOMC rate decision",
    time: "2:00 PM ET",
    meetingStart: "2026-03-17",
    hasProjections: true,
  },
  {
    date: "2026-04-10",
    type: "CPI",
    label: "CPI report: March 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-04-29",
    type: "FOMC",
    label: "FOMC rate decision",
    time: "2:00 PM ET",
    meetingStart: "2026-04-28",
  },
  {
    date: "2026-05-12",
    type: "CPI",
    label: "CPI report: April 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-06-10",
    type: "CPI",
    label: "CPI report: May 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-06-17",
    type: "FOMC",
    label: "FOMC rate decision",
    time: "2:00 PM ET",
    meetingStart: "2026-06-16",
    hasProjections: true,
  },
  {
    date: "2026-07-14",
    type: "CPI",
    label: "CPI report: June 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-07-29",
    type: "FOMC",
    label: "FOMC rate decision",
    time: "2:00 PM ET",
    meetingStart: "2026-07-28",
  },
  {
    date: "2026-08-12",
    type: "CPI",
    label: "CPI report: July 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-09-11",
    type: "CPI",
    label: "CPI report: August 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-09-16",
    type: "FOMC",
    label: "FOMC rate decision",
    time: "2:00 PM ET",
    meetingStart: "2026-09-15",
    hasProjections: true,
  },
  {
    date: "2026-10-14",
    type: "CPI",
    label: "CPI report: September 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-10-28",
    type: "FOMC",
    label: "FOMC rate decision",
    time: "2:00 PM ET",
    meetingStart: "2026-10-27",
  },
  {
    date: "2026-11-10",
    type: "CPI",
    label: "CPI report: October 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-12-09",
    type: "FOMC",
    label: "FOMC rate decision",
    time: "2:00 PM ET",
    meetingStart: "2026-12-08",
    hasProjections: true,
  },
  {
    date: "2026-12-10",
    type: "CPI",
    label: "CPI report: November 2026 data",
    time: "8:30 AM ET",
  },

  // ---- PPI (Producer Price Index; each release carries headline and core) --
  // bls.gov/schedule/news_release/ppi.htm, fetched 2026-09-05.
  {
    date: "2026-01-14",
    type: "PPI",
    label: "PPI report: November 2025 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-01-30",
    type: "PPI",
    label: "PPI report: December 2025 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-02-27",
    type: "PPI",
    label: "PPI report: January 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-03-18",
    type: "PPI",
    label: "PPI report: February 2026 data",
    time: "8:30 AM ET",
  },
  { date: "2026-04-14", type: "PPI", label: "PPI report: March 2026 data", time: "8:30 AM ET" },
  { date: "2026-05-13", type: "PPI", label: "PPI report: April 2026 data", time: "8:30 AM ET" },
  { date: "2026-06-11", type: "PPI", label: "PPI report: May 2026 data", time: "8:30 AM ET" },
  { date: "2026-07-15", type: "PPI", label: "PPI report: June 2026 data", time: "8:30 AM ET" },
  { date: "2026-08-13", type: "PPI", label: "PPI report: July 2026 data", time: "8:30 AM ET" },
  {
    date: "2026-09-10",
    type: "PPI",
    label: "PPI report: August 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-10-15",
    type: "PPI",
    label: "PPI report: September 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-11-13",
    type: "PPI",
    label: "PPI report: October 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-12-15",
    type: "PPI",
    label: "PPI report: November 2026 data",
    time: "8:30 AM ET",
  },

  // ---- Jobs report (BLS Employment Situation / nonfarm payrolls) -----------
  // bls.gov/schedule/news_release/empsit.htm, fetched 2026-09-05.
  {
    date: "2026-01-09",
    type: "JOBS",
    label: "Jobs report: December 2025 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-02-11",
    type: "JOBS",
    label: "Jobs report: January 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-03-06",
    type: "JOBS",
    label: "Jobs report: February 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-04-03",
    type: "JOBS",
    label: "Jobs report: March 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-05-08",
    type: "JOBS",
    label: "Jobs report: April 2026 data",
    time: "8:30 AM ET",
  },
  { date: "2026-06-05", type: "JOBS", label: "Jobs report: May 2026 data", time: "8:30 AM ET" },
  {
    date: "2026-07-02",
    type: "JOBS",
    label: "Jobs report: June 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-08-07",
    type: "JOBS",
    label: "Jobs report: July 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-09-04",
    type: "JOBS",
    label: "Jobs report: August 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-10-02",
    type: "JOBS",
    label: "Jobs report: September 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-11-06",
    type: "JOBS",
    label: "Jobs report: October 2026 data",
    time: "8:30 AM ET",
  },
  {
    date: "2026-12-04",
    type: "JOBS",
    label: "Jobs report: November 2026 data",
    time: "8:30 AM ET",
  },
];
