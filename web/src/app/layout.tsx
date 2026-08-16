import type { Metadata } from "next";
import { EB_Garamond, Geist_Mono, Inter } from "next/font/google";

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
};

// Applies a saved explicit theme choice before the browser paints. Without
// this, an explicit dark choice would flash light on every load: the server
// has no localStorage, so the first paint is always the light default, and a
// useEffect (React's usual "read after mount" idiom, used for the sidebar's
// collapse state) only fixes that up after hydration — fine for a layout
// shift, too jarring for a full theme flip. No system-preference branch here
// on purpose: an unset preference is already handled by pure CSS
// (@media (prefers-color-scheme: dark) in tokens.css), so this script has
// nothing to do in that case and stays this small.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var v = localStorage.getItem("printearnings:theme");
    if (v === "light" || v === "dark") {
      document.documentElement.setAttribute("data-theme", v);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${ebGaramond.variable}`}
      suppressHydrationWarning
    >
      {/*
        Browser extensions (Grammarly, form-fillers) inject attributes onto
        <body> before React hydrates — `data-gr-ext-installed` and friends —
        which React reports as a hydration mismatch we can't fix, because the
        markup was correct when we sent it.

        The suppression is one level deep: it covers <body>'s own attributes and
        nothing else, so a genuine mismatch inside the page still surfaces.
      */}
      <body className="min-h-screen" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
