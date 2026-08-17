"use client";

import { useState } from "react";

/**
 * A company's mark, from Google's free favicon service — no API key, no
 * signup. Clearbit's free logo API (the more obvious choice) was shut down
 * in December 2025 after HubSpot's acquisition; every remaining free-tier
 * alternative either requires a key or is a paid product.
 *
 * The `www.google.com/s2/favicons` URL below actually redirects to
 * `t{0-3}.gstatic.com/faviconV2` under the hood — CSP is enforced on
 * redirect targets too, so `img-src` in public/_headers has to allow
 * `*.gstatic.com`, not just `www.google.com`, or every logo silently falls
 * back to the letter avatar (this broke once already; the redirect target
 * isn't guaranteed stable, just currently how the endpoint behaves).
 *
 * Falls back to a ticker-letter avatar on load failure or when there's no
 * domain to look up (most tickers, until the nightly build has run for them)
 * — this must never be a broken-image icon or empty space.
 */
export function CompanyLogo({
  ticker,
  domain,
  size = 20,
}: {
  ticker: string;
  domain?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!domain || failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-[3px] bg-[var(--color-panel-soft)] font-mono font-medium text-[var(--color-muted)]"
        style={{ width: size, height: size, fontSize: size * 0.45 }}
        aria-hidden
      >
        {ticker.charAt(0)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-count logo domain; next/image's optimizer needs static export config we don't want per-domain.
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size <= 16 ? 32 : 64}`}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-[3px]"
      onError={() => setFailed(true)}
    />
  );
}
