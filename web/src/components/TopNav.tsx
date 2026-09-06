"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/Logo";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TickerSearch } from "@/components/TickerSearch";
import type { TickerIndexEntry } from "@/lib/types";

/**
 * Global top navigation — the app shell's spine, replacing the old left
 * sidebar. Primary destinations sit in the bar; everything else lives under
 * "More" so nothing is lost to the narrower horizontal space. Sticky, with a
 * translucent blur so the data scrolls under it without the bar disappearing.
 *
 * Below `lg` the links collapse into MobileNav's drawer (same destinations),
 * leaving just the menu trigger, logo, and search.
 */

const PRIMARY = [
  { href: "/dashboard/", label: "Dashboard" },
  { href: "/calendar/", label: "Calendar" },
  { href: "/tickers/", label: "Tickers" },
  { href: "/signals/", label: "Signals" },
  { href: "/macro-calendar/", label: "Macro" },
];

const MORE = [
  { href: "/track-record/", label: "Track record" },
  { href: "/simulator/", label: "Simulator" },
  { href: "/past-earnings/", label: "Past earnings" },
  { href: "/methodology/", label: "Methodology" },
  { href: "/faq/", label: "FAQ" },
  { href: "/support/", label: "Support" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href);
}

const linkClass = (active: boolean) =>
  `rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
      : "text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]"
  }`;

export function TopNav({ tickers }: { tickers: TickerIndexEntry[] }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close the More menu on any click outside it or on Escape — the standard
  // dropdown-dismiss contract, since the menu is absolutely positioned and
  // wouldn't otherwise close when focus moves elsewhere.
  useEffect(() => {
    if (!moreOpen) return;
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const moreActive = MORE.some((m) => isActive(pathname, m.href));

  return (
    <header
      className="sticky top-0 z-30 border-b border-[var(--color-border)]"
      style={{
        background: "color-mix(in srgb, var(--color-panel) 88%, transparent)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div className="mx-auto grid h-16 w-full max-w-[1320px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="lg:hidden">
            <MobileNav />
          </div>
          <Link href="/" aria-label="PrintEarnings" className="shrink-0">
            <Logo size="sm" />
          </Link>
        </div>

        <nav className="hidden items-center gap-1 lg:flex">
          {PRIMARY.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(isActive(pathname, item.href))}
            >
              {item.label}
            </Link>
          ))}

          <div ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              className={`inline-flex items-center gap-1 ${linkClass(moreActive)}`}
            >
              More
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                aria-hidden
                className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {moreOpen && (
              <div
                role="menu"
                className="absolute top-full left-0 mt-1.5 w-52 rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-panel)] py-1.5"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                {MORE.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setMoreOpen(false)}
                    className={`block px-4 py-2 text-sm transition-colors ${
                      isActive(pathname, item.href)
                        ? "text-[var(--color-brand)]"
                        : "text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center justify-end gap-2 sm:gap-3">
          <div className="w-auto sm:w-56">
            <TickerSearch tickers={tickers} compact />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
