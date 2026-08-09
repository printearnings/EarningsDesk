"use client";

import { useState } from "react";

/**
 * A story's thumbnail, from Yahoo's CDN. Unlike CompanyLogo, this has no
 * letter-avatar fallback — a missing photo just means the headline renders as
 * plain text, which is a complete, unbroken result on its own. `onError`
 * requires a Client Component; the page that renders this is a Server
 * Component, hence this small wrapper.
 */
export function NewsThumbnail({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- external CDN, static export has no image optimizer configured for arbitrary domains.
    <img
      src={src}
      alt={alt}
      width={64}
      height={64}
      className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] object-cover"
      onError={() => setFailed(true)}
    />
  );
}
