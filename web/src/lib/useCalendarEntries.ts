"use client";

import { useEffect, useState } from "react";

import type { CalendarEntry } from "@/lib/types";

/**
 * Client-side fetch of the full calendar payload, for the day-detail page.
 *
 * Deliberately doesn't import `getCalendarFull` from `@/lib/api` — that
 * function dynamically imports `node:fs/promises` for the static-export
 * read path, which is fine inside a Server Component but would pull Node
 * internals into the browser bundle here (see the file-level comment on
 * api.ts). Same two-mode split as that module, just reimplemented with
 * plain `fetch`, which works in both places: a live API_URL in dev, the
 * prebuilt static JSON — served as an ordinary public asset by Cloudflare,
 * not routed through the Worker — in production.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface CalendarFullResponse {
  entries: CalendarEntry[];
}

export function useCalendarEntries() {
  const [entries, setEntries] = useState<CalendarEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = API_URL ? `${API_URL}/api/calendar/full` : "/data/calendar-full.json";

    fetch(url, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<CalendarFullResponse>) : null))
      .then((body) => {
        if (cancelled) return;
        if (body) setEntries(body.entries);
        else setError(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { entries, error };
}
