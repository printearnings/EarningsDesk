import type { MetadataRoute } from "next";

import { getIndex } from "@/lib/api";
import { SITE_URL } from "@/lib/seo";

// Rendered once at build time into out/sitemap.xml (static export).
export const dynamic = "force-static";

/**
 * Pages a search engine should index. Ticker pages are included only when
 * the API marks them `indexable` (a live implied move, or enough past
 * earnings moves to show): the rest are near-empty templates, the "thin
 * content" that got the site an AdSense low-value rejection in Oct 2026, and
 * they carry `noindex` on the page itself. Utility pages (the query-driven
 * day view, the lookup form) and the legal boilerplate are left out too.
 */
const CONTENT_PAGES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/dashboard/", priority: 0.9, changeFrequency: "daily" },
  { path: "/calendar/", priority: 0.9, changeFrequency: "daily" },
  { path: "/track-record/", priority: 0.8, changeFrequency: "daily" },
  { path: "/how-we-score/", priority: 0.8, changeFrequency: "weekly" },
  { path: "/past-earnings/", priority: 0.7, changeFrequency: "daily" },
  { path: "/signals/", priority: 0.7, changeFrequency: "daily" },
  { path: "/tickers/", priority: 0.7, changeFrequency: "daily" },
  { path: "/macro-calendar/", priority: 0.5, changeFrequency: "weekly" },
  { path: "/simulator/", priority: 0.5, changeFrequency: "monthly" },
  { path: "/methodology/", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about/", priority: 0.6, changeFrequency: "monthly" },
  { path: "/faq/", priority: 0.5, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const index = await getIndex();
  const builtAt = new Date(index.generated_at);

  return [
    ...CONTENT_PAGES.map((p) => ({
      url: `${SITE_URL}${p.path}`,
      lastModified: builtAt,
      changeFrequency: p.changeFrequency,
      priority: p.priority,
    })),
    ...index.tickers
      .filter((t) => t.indexable)
      .map((t) => ({
        url: `${SITE_URL}/t/${t.ticker}/`,
        lastModified: builtAt,
        changeFrequency: "daily" as const,
        priority: t.implied_move != null ? 0.7 : 0.4,
      })),
  ];
}
