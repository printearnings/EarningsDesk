"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { COOKIE_CHOICE_KEY } from "@/lib/consent";

// Bump the suffix if what's disclosed here changes materially — same
// convention DisclaimerGate uses, so a stored "accepted" from an old
// disclosure doesn't silently cover a new one.
// Shared with the layout's inline consent script (see lib/consent.ts).
const STORAGE_KEY = COOKIE_CHOICE_KEY;

type AdsQueue = unknown[] & { requestNonPersonalizedAds?: number };

/**
 * A non-blocking bottom bar, not a modal — unlike DisclaimerGate, there is
 * nothing here that needs to stop someone from browsing before they see it.
 *
 * Two things set cookies: Cloudflare's `cf_clearance` (strictly necessary
 * bot/security mitigation) and Google AdSense (advertising, which can be
 * personalized). "Reject non-essential" asks Google for non-personalized ads
 * only — applied immediately for this page, and before the first ad request
 * on every later page load by the layout's inline consent script. Non-personalized ads can
 * still use cookies for frequency capping, fraud prevention and aggregate
 * reporting; the privacy page says so.
 *
 * Client-only for the same reason DisclaimerGate is: localStorage isn't
 * available during the static export's server render.
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Reading an external system (localStorage) once on mount, the same
    // documented exception DisclaimerGate's own read relies on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(localStorage.getItem(STORAGE_KEY) === null);
  }, []);

  function choose(value: "accepted" | "rejected") {
    localStorage.setItem(STORAGE_KEY, value);
    // Apply to this page's remaining ad requests too (the inline consent script covers
    // every later load before the first request).
    const w = window as unknown as { adsbygoogle?: AdsQueue };
    (w.adsbygoogle ??= []).requestNonPersonalizedAds = value === "rejected" ? 1 : 0;
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-4 opacity-100 shadow-lg transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] sm:px-6 starting:translate-y-full starting:opacity-0"
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-[var(--color-heading)]">
            Cookie preferences
          </p>
          <p className="mt-1 text-sm text-[var(--color-body)]">
            Cloudflare sets a cookie to keep the site secure. Ads here are served by Google
            AdSense, which uses cookies, including to personalize ads. Reject non-essential to see
            only non-personalized ads.{" "}
            <Link href="/privacy/" className="underline underline-offset-2">
              Learn more
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="pressable rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium whitespace-nowrap text-[var(--color-heading)] transition-colors hover:bg-[var(--color-panel-soft)]"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="pressable rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium whitespace-nowrap text-[var(--color-on-brand)] transition-opacity hover:opacity-90"
            style={{ background: "var(--gradient-brand)" }}
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
