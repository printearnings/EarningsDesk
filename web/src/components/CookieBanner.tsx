"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Bump the suffix if what's disclosed here changes materially — same
// convention DisclaimerGate uses, so a stored "accepted" from an old
// disclosure doesn't silently cover a new one.
const STORAGE_KEY = "earningsdesk:cookie-choice-v1";

/**
 * A non-blocking bottom bar, not a modal — unlike DisclaimerGate, there is
 * nothing here that needs to stop someone from browsing before they see it.
 *
 * The only cookie this site currently sets is Cloudflare's own
 * `cf_clearance` (bot/security mitigation at the edge, not analytics,
 * advertising, or cross-site tracking — confirmed by inspecting the site's
 * actual cookies, not assumed). That kind of strictly-necessary security
 * cookie is the standard exemption in both GDPR/ePrivacy and CCPA-style
 * regimes, so "Reject" has nothing to disable today. This banner exists so
 * the choice is on record — and something to actually gate — the day this
 * site adds anything that isn't strictly necessary (analytics, ads).
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
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-4 opacity-100 shadow-lg transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] sm:px-6 starting:translate-y-full starting:opacity-0"
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--color-body)]">
          This site uses one cookie, set by Cloudflare for bot/security protection — not
          tracking or ads.{" "}
          <Link href="/privacy/" className="underline underline-offset-2">
            Learn more
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="pressable rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-heading)] transition-colors hover:bg-[var(--color-panel-soft)]"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="pressable rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium text-[var(--color-on-brand)] transition-opacity hover:opacity-90"
            style={{ background: "var(--gradient-brand)" }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
