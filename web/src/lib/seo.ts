import type { Metadata } from "next";

/** The public origin. Canonical URLs and the sitemap are built from it. */
export const SITE_URL = "https://printearnings.com";

/**
 * Per-page metadata: a title, its own description (the root layout's is a
 * site-wide fallback, and every page sharing it reads as duplicate content),
 * and a canonical URL so a search engine indexes one address per page.
 *
 * `path` is the route with its trailing slash ("/faq/"), matching the static
 * export's `trailingSlash: true`. `noindex` keeps utility pages (a query-
 * driven day view, a lookup form) out of search results while still letting
 * crawlers follow their links.
 */
export function pageMeta(
  title: string,
  path: string,
  description: string,
  { noindex = false }: { noindex?: boolean } = {},
): Metadata {
  return {
    title: `${title} | PrintEarnings`,
    description,
    alternates: { canonical: path },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
