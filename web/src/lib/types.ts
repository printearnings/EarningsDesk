/**
 * Wire types, split out from `api.ts` so Client Components can import them.
 *
 * `api.ts` dynamically imports `node:fs` for the static-export read path, which
 * makes it unsafe to pull into anything that runs in the browser. Types are
 * erased at compile time, so a separate module costs nothing at runtime and
 * removes the footgun entirely.
 *
 * All of these are generated from the Python Pydantic models — see
 * `npm run gen:types`.
 */

import type { components } from "./schema";

type S = components["schemas"];

export type TickerPage = S["TickerPage"];
export type CalendarPage = S["CalendarPage"];
export type CalendarEntry = S["CalendarEntry"];
export type PeerEarnings = S["PeerEarnings"];
export type PastEarningsPage = S["PastEarningsPage"];
export type PastEarningsRow = S["PastEarningsRow"];
export type SignalsPage = S["SignalsPage"];
export type SignalRow = S["SignalRow"];
export type TrackRecordPage = S["TrackRecordPage"];
export type SiteIndex = S["SiteIndex"];
export type TickerIndexEntry = S["TickerIndexEntry"];
export type EarningsHistoryRow = S["EarningsHistoryRow"];
export type OptionsPanel = S["OptionsPanel"];
export type HistoryStats = S["HistoryStats"];
export type AiSummary = S["AiSummary"];
export type PricePoint = S["PricePoint"];
export type Fundamentals = S["Fundamentals"];
export type AnalystRatingRow = S["AnalystRatingRow"];
export type NewsItem = S["NewsItem"];
export type DashboardNewsPage = S["DashboardNewsPage"];
export type DashboardNewsItem = S["DashboardNewsItem"];
