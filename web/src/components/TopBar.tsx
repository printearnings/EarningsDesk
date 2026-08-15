"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { TickerSearch } from "@/components/TickerSearch";
import type { TickerIndexEntry } from "@/lib/types";

const MOBILE_NAV = [
  { href: "/dashboard/", label: "Dashboard" },
  { href: "/calendar/", label: "Calendar" },
  { href: "/signals/", label: "Signals" },
  { href: "/track-record/", label: "Record" },
];

/**
 * App top bar: page title on the left, ticker search on the right.
 *
 * Flat and bordered like everything else — no shadow, no sticky blur. It scrolls
 * with the page rather than pinning, because the ticker page is dense and a
 * fixed bar eats vertical space that belongs to the data.
 */
export function TopBar({
  title,
  eyebrow,
  tickers,
}: {
  title: string;
  eyebrow?: string;
  tickers: TickerIndexEntry[];
}) {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-panel)]">
      <div className="flex flex-wrap items-center gap-4 px-6 py-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="display truncate text-2xl">{title}</h1>
        </div>

        <div className="ml-auto w-full max-w-xs">
          <TickerSearch tickers={tickers} compact />
        </div>

        {/* The sidebar is hidden below lg, so the nav has to live somewhere on
            small screens. Skips whichever item is the page you're already
            on — that page's own heading, right above this row, already says
            its name once; repeating it as a link back to itself added
            nothing and read as a glitch, not a nav. */}
        <nav className="flex w-full gap-4 text-sm lg:hidden">
          {MOBILE_NAV.filter((item) => item.href !== pathname).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[var(--color-body)] hover:text-[var(--color-heading)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
