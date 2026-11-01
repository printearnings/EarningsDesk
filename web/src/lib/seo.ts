import type { Metadata } from "next";

/** The public origin. Canonical URLs and the sitemap are built from it. */
export const SITE_URL = "https://printearnings.com";
export const SITE_NAME = "PrintEarnings";

/**
 * The link-preview image (1200x630) every page shares. Its source is
 * og/og.html; regenerate the PNG from it with headless Chrome when the copy
 * changes.
 */
const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "PrintEarnings" };

/**
 * Open Graph and Twitter card tags for a page. Next replaces a parent's
 * `openGraph` wholesale rather than merging it, so every page that sets its
 * own title gets the full set here, image included; otherwise a shared link
 * would preview with the root layout's title on every page.
 */
export function socialMeta(
  title: string,
  description: string,
  path: string,
): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: path,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

/**
 * Per-page metadata: a title, its own description (the root layout's is a
 * site-wide fallback, and every page sharing it reads as duplicate content),
 * a canonical URL so a search engine indexes one address per page, and the
 * social preview tags.
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
  const fullTitle = `${title} | ${SITE_NAME}`;
  return {
    title: fullTitle,
    description,
    alternates: { canonical: path },
    ...socialMeta(fullTitle, description, path),
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
