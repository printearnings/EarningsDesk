import Link from "next/link";

/**
 * Persistent footer for every (app) page — the disclaimer modal only shows
 * once, so this is the always-reachable place to re-read it (or find the
 * privacy page) without digging through browser storage to reset the flag.
 */
export function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] px-6 py-5">
      <p className="text-2xs text-[var(--color-muted)]">
        EarningsDesk: informational only, not financial advice.{" "}
        <Link href="/disclaimer/" className="underline underline-offset-2">
          Disclaimer
        </Link>
        {" · "}
        <Link href="/privacy/" className="underline underline-offset-2">
          Privacy
        </Link>
        {" · "}
        <Link href="/faq/" className="underline underline-offset-2">
          FAQ
        </Link>
      </p>
    </footer>
  );
}
