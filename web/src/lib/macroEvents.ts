export type MacroEventType = "FOMC" | "CPI";

export interface MacroEvent {
  /** ISO date of the market-moving day itself — the FOMC decision/press
   * conference day (not the first day of a 2-day meeting), or the CPI
   * release day. */
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
 * (federalreserve.gov/monetarypolicy/fomccalendars.htm) and the BLS CPI
 * release schedule (bls.gov/schedule/news_release/cpi.htm), both fetched
 * 2026-08-16. The Fed and BLS publish roughly 12-18 months out — this list
 * needs a manual refresh once they post dates beyond what's here, since
 * neither publishes a public API for it and scraping either page for ~20
 * dates a year isn't worth the fragility.
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
];
