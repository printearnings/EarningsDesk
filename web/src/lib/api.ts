/**
 * Typed data access.
 *
 * Every type here is derived from `schema.d.ts`, which `npm run gen:types`
 * generates from the Python Pydantic models in api/app/schemas.py. Nothing in
 * this file hand-writes a shape — rename a field in Python without updating
 * the components and `npm run typecheck` fails.
 *
 * Two modes:
 *   production  — static JSON under /data, served by Cloudflare Pages
 *   development — the FastAPI dev server, so you see DB changes without a rebuild
 *
 * Both are plain GETs with no credentials. That's deliberate: no cookies means
 * no ambient authority, which means no CSRF surface. If cookie sessions are
 * ever added, CSRF protection becomes mandatory.
 *
 * Types live in `./types` rather than here, because this module dynamically
 * imports `node:fs` for the static-export read path — pulling it into a
 * Client Component (search, charts) would break the browser build. `./types`
 * has no runtime code, so it's safe for both sides; re-exported here so
 * existing `from "@/lib/api"` imports keep working.
 */

import type {
  CalendarPage,
  DashboardNewsPage,
  PastEarningsPage,
  SignalsPage,
  SiteIndex,
  TickerPage,
  TrackRecordPage,
} from "./types";

export type * from "./types";

/** Set NEXT_PUBLIC_API_URL to point the app at a running FastAPI instance. */
const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Static export prerenders at build time, so fetches run in Node against the
 * filesystem rather than over HTTP. Reading the file directly avoids needing a
 * server to be up during `next build`.
 */
async function readStatic<T>(file: string): Promise<T> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const path = join(process.cwd(), "public", "data", file);
  return JSON.parse(await readFile(path, "utf-8")) as T;
}

async function get<T>(apiPath: string, staticFile: string): Promise<T> {
  if (API_URL) {
    const res = await fetch(`${API_URL}${apiPath}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${apiPath} -> ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  }
  return readStatic<T>(staticFile);
}

/**
 * Returns null instead of throwing when the data simply isn't there — a ticker
 * we don't cover is a 404 page, not a build failure.
 */
async function getOrNull<T>(apiPath: string, staticFile: string): Promise<T | null> {
  try {
    return await get<T>(apiPath, staticFile);
  } catch {
    return null;
  }
}

export function getIndex(): Promise<SiteIndex> {
  return get<SiteIndex>("/api/index", "index.json");
}

export function getCalendar(days = 14): Promise<CalendarPage> {
  return get<CalendarPage>(`/api/calendar?days=${days}`, `calendar-${days}.json`);
}

export function getTicker(ticker: string): Promise<TickerPage | null> {
  const t = ticker.toUpperCase();
  return getOrNull<TickerPage>(`/api/ticker/${t}`, `ticker/${t}.json`);
}

/** ~1.5 years of events in one payload, for the month-grid calendar to
 * navigate client-side with no per-month request. */
export function getCalendarFull(): Promise<CalendarPage> {
  return get<CalendarPage>("/api/calendar/full", "calendar-full.json");
}

export function getPastEarnings(): Promise<PastEarningsPage> {
  return get<PastEarningsPage>("/api/past-earnings", "past-earnings.json");
}

export function getSignals(): Promise<SignalsPage> {
  return get<SignalsPage>("/api/signals", "signals.json");
}

export function getTrackRecord(): Promise<TrackRecordPage> {
  return get<TrackRecordPage>("/api/track-record", "track-record.json");
}

export function getDashboardNews(): Promise<DashboardNewsPage> {
  return get<DashboardNewsPage>("/api/dashboard-news", "dashboard-news.json");
}
