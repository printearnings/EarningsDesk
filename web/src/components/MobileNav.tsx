"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { MAIN, OTHER } from "@/components/Sidebar";

/**
 * Hamburger + slide-in drawer, for the same width range the desktop Sidebar
 * is `hidden` at (`lg:hidden` there, this component only renders below
 * `lg`). Lists every destination the Sidebar does — the single-row inline
 * link list this replaced only fit 4 of 8 pages before running out of
 * horizontal space, so Tickers, Past earnings, and Methodology were simply
 * unreachable on a phone.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Closing on navigation (not just outside-click) matters here specifically
  // because every drawer link is a full-page nav on a static export —
  // without this the drawer would still be open, obscuring the new page, for
  // the instant before Next's client router swaps the view. Reset during
  // render (React's documented pattern for "reset state when a value
  // changes") rather than a setState-in-effect, the same idiom
  // TickerSearch/useIntradayChart use elsewhere in this app.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]"
      >
        <MenuIcon />
      </button>

      {open && (
        <>
          {/* Same origin-aware entrance every popover in this app uses:
              scale/opacity from `@starting-style`, not a JS-driven mount
              animation. */}
          <div
            className="fixed inset-0 z-30 bg-[var(--color-heading)]/30 opacity-100 transition-opacity duration-[var(--duration-base)] ease-[var(--ease-out)] starting:opacity-0"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="fixed inset-y-0 left-0 z-40 flex w-64 origin-left translate-x-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-panel)] opacity-100 transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] starting:translate-x-[-100%] starting:opacity-0"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <span className="font-mono text-sm font-medium tracking-[0.08em] uppercase">
                Earnings<span className="text-[var(--color-muted)]">Desk</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="pressable flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)] hover:text-[var(--color-heading)]"
              >
                <CloseIcon />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 pt-3">
              <ul className="space-y-0.5">
                {MAIN.map((item) => (
                  <DrawerItem key={item.href} {...item} pathname={pathname} />
                ))}
              </ul>

              <p className="eyebrow px-2 pt-6 pb-2">Others</p>
              <ul className="space-y-0.5">
                {OTHER.map((item) => (
                  <DrawerItem key={item.href} {...item} pathname={pathname} />
                ))}
              </ul>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}

function DrawerItem({
  href,
  label,
  icon: Icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: () => React.ReactElement;
  pathname: string;
}) {
  const active = pathname === href || (href === "/calendar/" && pathname.startsWith("/t/"));

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`pressable flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors ${
          active
            ? "bg-[var(--color-brand)] text-[var(--color-on-brand)]"
            : "text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]"
        }`}
      >
        <Icon />
        {label}
      </Link>
    </li>
  );
}

function MenuIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M2 4.5h12M2 8h12M2 11.5h12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 3l10 10M13 3 3 13" />
    </svg>
  );
}
