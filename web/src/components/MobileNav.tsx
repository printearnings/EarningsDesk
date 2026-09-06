"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Logo } from "@/components/Logo";
import { HELP, MAIN, MORE_DATA } from "@/components/Sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    // Freeze the page behind the drawer so a touch-scroll drags the drawer's
    // own list, not the dashboard underneath it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
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

      {/* The drawer must render into document.body, not here: this component
          lives inside the sticky top nav, and `sticky z-30` on that header
          creates its own stacking context. A drawer painted inside it can
          never rise above the header's own right-side actions — the theme
          toggle bled out past the drawer's edge through the dim overlay.
          Portaling to the body escapes that context so the overlay covers the
          whole viewport, header included. `open` only flips true on a client
          click, so document always exists by the time this renders (SSR and
          first paint both have open=false — no hydration mismatch). */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Same origin-aware entrance every popover in this app uses:
              scale/opacity from `@starting-style`, not a JS-driven mount
              animation. z-[60]/[70] clear the sticky top nav (z-30) so the
              overlay covers it rather than letting its actions peek through. */}
            <div
              className="fixed inset-0 z-[60] bg-[var(--color-heading)]/40 opacity-100 transition-opacity duration-[var(--duration-base)] ease-[var(--ease-out)] starting:opacity-0"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
              className="fixed inset-y-0 left-0 z-[70] flex w-[min(18rem,85vw)] origin-left translate-x-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-panel)] opacity-100 transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] starting:translate-x-[-100%] starting:opacity-0"
            >
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
                <Logo size="sm" />
                <div className="flex items-center gap-1">
                  <ThemeToggle />
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className="pressable flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)] hover:text-[var(--color-heading)]"
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>

              <nav className="flex-1 overflow-y-auto px-2 pt-3">
                <ul className="space-y-0.5">
                  {MAIN.map((item) => (
                    <DrawerItem key={item.href} {...item} pathname={pathname} />
                  ))}
                </ul>

                <p className="eyebrow px-2 pt-6 pb-2">More data</p>
                <ul className="space-y-0.5">
                  {MORE_DATA.map((item) => (
                    <DrawerItem key={item.href} {...item} pathname={pathname} />
                  ))}
                </ul>

                <p className="eyebrow px-2 pt-6 pb-2">Help</p>
                <ul className="space-y-0.5">
                  {HELP.map((item) => (
                    <DrawerItem key={item.href} {...item} pathname={pathname} />
                  ))}
                </ul>
              </nav>
            </div>
          </>,
          document.body,
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
        style={active ? { background: "var(--gradient-brand)" } : undefined}
        className={`pressable flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors ${
          active
            ? "text-[var(--color-on-brand)]"
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
