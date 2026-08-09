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
  title: "EarningsDesk",
  description:
    "What the options market is pricing into an earnings print, and what actually happened the last eight quarters.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${ebGaramond.variable}`}
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
        {children}
      </body>
    </html>
  );
}
