import type { Metadata } from "next";
import { EB_Garamond, Geist_Mono, Inter } from "next/font/google";
import Script from "next/script";

import { CookieBanner } from "@/components/CookieBanner";
import { ADS_CONSENT_INLINE_SCRIPT } from "@/lib/consent";

import "./globals.css";

/*
 * Root layout: fonts and global styles only.
 *
 * The chrome (sidebar, top bar) lives in the (app) route group instead, so the
 * landing page at / can render full-bleed without it.
 *
 * EB Garamond stands in for Adobe Jenson Pro, which isn't openly licensed.
 * next/font self-hosts all three at build time, so the static export ships them
 * as files — no runtime request to Google.
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: ["400", "500"],
  display: "swap",
});

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-eb-garamond",
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PrintEarnings",
  description:
    "What the options market is pricing into an earnings print, and what actually happened the last eight quarters.",
  // AdSense site-ownership meta tag - the "Meta tag" verification method. Next
  // renders this as a real <meta> in the static HTML head.
  other: { "google-adsense-account": "ca-pub-1352071292500585" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${ebGaramond.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Google AdSense loader - a plain async <script> tag, NOT next/script.
          In the App Router, next/script (even strategy="beforeInteractive")
          emits a `self.__next_s.push(...)` bootstrap and creates the tag from
          JS, so the literal snippet never appears in the static HTML - and
          AdSense's site verification looks for exactly that literal tag. A raw
          async script is rendered verbatim into the exported <head>. The
          matching ads.txt lives in public/, and the CSP in public/_headers
          allows the googlesyndication/doubleclick/adtrafficquality domains.

          The inline consent script runs synchronously during parsing: if the
          visitor rejected non-essential cookies on the banner it sets
          requestNonPersonalizedAds before the async loader can execute (React
          hoists async scripts above it, but an async script can't run first).
        */}
        <script dangerouslySetInnerHTML={{ __html: ADS_CONSENT_INLINE_SCRIPT }} />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1352071292500585"
          crossOrigin="anonymous"
        />
      </head>
      {/*
        Browser extensions (Grammarly, form-fillers) inject attributes onto
        <body> before React hydrates — `data-gr-ext-installed` and friends —
        which React reports as a hydration mismatch we can't fix, because the
        markup was correct when we sent it.

        The suppression is one level deep: it covers <body>'s own attributes and
        nothing else, so a genuine mismatch inside the page still surfaces.
      */}
      <body className="min-h-screen" suppressHydrationWarning>
        {/*
          Applies a saved explicit theme choice before the browser paints.
          Without this, an explicit dark choice would flash light on every
          load: the server has no localStorage, so the first paint is always
          the light default, and a useEffect only fixes that up after
          hydration — fine for a layout shift, too jarring for a full theme
          flip. No system-preference branch on purpose: an unset preference
          is already handled by pure CSS (tokens.css), so this script has
          nothing to do in that case and stays this small.

          A real static file at /theme-init.js, not an inline
          dangerouslySetInnerHTML script — a strict CSP (script-src 'self')
          can allow this without an 'unsafe-inline' carve-out or a hash that
          silently goes stale the next time this script's contents change.
          `beforeInteractive` is next/script's own sanctioned way to inject a
          blocking pre-hydration script, so this doesn't need the raw <script>
          tag @next/next/no-sync-scripts would otherwise flag.
        */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
