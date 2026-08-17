import Link from "next/link";

/**
 * Persistent footer for every (app) page — the disclaimer modal only shows
 * once, so this is the always-reachable place to re-read it (or find the
 * privacy page) without digging through browser storage to reset the flag.
 * The copyright year comes from the build machine's clock — this is a
 * static export, so it's fixed at whatever the last deploy's build time
 * was, not live at request time (fine in practice: deploys run nightly).
 * `pb-24` leaves room for CookieBanner's fixed bottom bar so the two never
 * overlap on a short page.
 */
export function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] px-6 py-5 pb-24 text-center">
      <p className="text-2xs text-[var(--color-muted)]">
        &copy; {new Date().getFullYear()} PrintEarnings. Informational only, not financial
        advice.{" "}
        <Link href="/disclaimer/" className="underline underline-offset-2">
          Disclaimer
        </Link>
        {" · "}
        <Link href="/privacy/" className="underline underline-offset-2">
          Privacy
        </Link>
        {" · "}
        <Link href="/terms/" className="underline underline-offset-2">
          Terms
        </Link>
        {" · "}
        <Link href="/faq/" className="underline underline-offset-2">
          FAQ
        </Link>
      </p>
    </footer>
  );
}
