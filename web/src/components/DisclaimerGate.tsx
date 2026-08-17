"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DISCLAIMER_PARAGRAPHS } from "@/lib/legal";

// Bump the suffix (v1 -> v2) if the policy text materially changes -- that's
// the mechanism for making previously-accepted visitors re-acknowledge it,
// not a fresh key that just orphans the old one.
const STORAGE_KEY = "earningsdesk:disclaimer-accepted-v1";

/**
 * A blocking first-visit acknowledgment, not a passive footer line.
 *
 * Exists specifically because of the directional read (BULLISH/BEARISH) on
 * ticker pages -- unlike the vol rich/cheap verdict, a directional call
 * reads as "which way to bet" even though it's a model output over options
 * flow and sentiment, not a recommendation. That distinction has to be seen
 * before someone acts on the number, not discoverable only if they happen
 * to scroll to a footer.
 *
 * Client-only by necessity (localStorage isn't available during the static
 * export's server render), so there's an unavoidable instant where the page
 * is visible before this mounts -- the same tradeoff every client-side
 * cookie/age-gate on a statically-hosted site makes. Not a security
 * boundary, just an acknowledgment.
 */
export function DisclaimerGate() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Reading an external system (localStorage) once on mount, the same
    // documented exception Sidebar's collapse-state read relies on.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(localStorage.getItem(STORAGE_KEY) !== "1");
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* No backdrop click, no Escape — the only way through is the button. */}
      <div className="fixed inset-0 bg-[var(--color-heading)]/40" aria-hidden />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="disclaimer-title"
        className="relative w-full max-w-md origin-center rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-panel)] p-6 opacity-100 shadow-lg transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] starting:scale-95 starting:opacity-0"
      >
        <h2 id="disclaimer-title" className="display text-xl">
          Read before continuing
        </h2>

        <div className="mt-3 space-y-3 text-sm text-[var(--color-body)]">
          {DISCLAIMER_PARAGRAPHS.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>

        <button
          type="button"
          onClick={accept}
          className="pressable mt-5 w-full rounded-[var(--radius-sm)] px-4 py-2.5 text-sm font-medium text-[var(--color-on-brand)] transition-opacity hover:opacity-90"
          style={{ background: "var(--gradient-brand)" }}
        >
          Acknowledge and continue
        </button>

        <p className="mt-3 text-center text-xs text-[var(--color-muted)]">
          <Link href="/disclaimer/" className="underline underline-offset-2">
            Full disclaimer
          </Link>
          {" · "}
          <Link href="/privacy/" className="underline underline-offset-2">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}
