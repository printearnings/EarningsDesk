"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Same key the blocking gate used, so anyone who already acknowledged it
// isn't asked again. Bump the suffix (v1 -> v2) if the policy text
// materially changes.
const STORAGE_KEY = "earningsdesk:disclaimer-accepted-v1";

/**
 * A first-visit notice above the page, not a modal over it.
 *
 * It used to be a blocking dialog, because the directional read
 * (BULLISH/BEARISH) can look like "which way to bet". That lean is now
 * hidden site-wide until its record clears the accuracy gate, and a dialog
 * covering the content on first load is a poor first impression for readers
 * and ad reviewers alike (AdSense "low value content" rejection, Oct 2026).
 * The notice still sits at the top of every page until dismissed, the
 * footer links the full disclaimer on every page, and the ticker header
 * states its own record next to every claim.
 *
 * Client-only: localStorage isn't available during the static export's
 * render, so it appears after hydration.
 */
export function DisclaimerNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Reading an external system (localStorage) once on mount, the same
    // documented exception Sidebar's collapse-state read relies on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(localStorage.getItem(STORAGE_KEY) !== "1");
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="note"
      className="border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] px-6 py-2.5 text-sm text-[var(--color-body)]"
    >
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p>
          Informational only, not financial advice. Figures are model outputs over public market
          data; verify before you trade, and the decision is yours.{" "}
          <Link href="/disclaimer/" className="underline underline-offset-2">
            Full disclaimer
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="pressable shrink-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-heading)] hover:bg-[var(--color-panel)]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
