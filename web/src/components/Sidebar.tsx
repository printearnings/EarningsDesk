"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Persistent left navigation. Collapsible to an icon rail.
 *
 * Collapse state persists in localStorage so it survives a hard navigation
 * (typing a URL, opening a link in a new tab) — within the (app) layout it
 * would survive anyway since the layout stays mounted across client-side
 * route changes, but a full load remounts it.
 *
 * Icons are inline SVG rather than an icon package: there are eight of them,
 * and a dependency that ships thousands to use eight is a poor trade in a
 * bundle that otherwise has no runtime deps.
 */

// Exported so MobileNav's drawer lists the exact same destinations as the
// desktop rail — the mobile nav row this replaced only had room for 4 of the
// app's 8 pages and silently dropped Tickers, Past earnings, and
// Methodology, which had no other way to reach them.
export const MAIN = [
  { href: "/dashboard/", label: "Dashboard", icon: GridIcon },
  { href: "/tickers/", label: "Tickers", icon: TickerIcon },
  { href: "/calendar/", label: "Calendar", icon: CalendarIcon },
  { href: "/signals/", label: "Signals", icon: PulseIcon },
  { href: "/track-record/", label: "Track record", icon: TargetIcon },
];

export const OTHER = [
  { href: "/past-earnings/", label: "Past earnings", icon: HistoryIcon },
  { href: "/methodology/", label: "Methodology", icon: BookIcon },
  { href: "/faq/", label: "FAQ", icon: QuestionIcon },
];

const STORAGE_KEY = "earningsdesk:sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Read the stored preference after mount, not during render: the server has
  // no localStorage, so reading it eagerly would make the first client render
  // disagree with the server-rendered HTML and trip a hydration warning.
  useEffect(() => {
    // This is precisely the documented exception: reading a value from an
    // external system (localStorage, unavailable during SSR) once on mount.
    // There is no render-time equivalent — render-time state resets work for
    // reacting to a *changed prop*, not for an initial read that can only
    // happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
    setHydrated(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={`hidden shrink-0 border-r border-[var(--color-border)] bg-[var(--color-panel)] transition-[width] duration-[var(--duration-panel)] ease-[var(--ease-in-out)] lg:flex lg:flex-col ${
        collapsed ? "w-14" : "w-60"
      } ${hydrated ? "" : "invisible"}`}
    >
      <div
        className={`flex items-center border-b border-[var(--color-border)] py-4 ${
          collapsed ? "flex-col gap-3 px-2" : "justify-between px-5"
        }`}
      >
        {collapsed ? (
          <Link href="/" aria-label="EarningsDesk" className="font-mono text-sm font-bold">
            ED
          </Link>
        ) : (
          <Link href="/" className="font-mono text-sm font-medium tracking-[0.08em] uppercase">
            Earnings<span className="text-[var(--color-muted)]">Desk</span>
          </Link>
        )}

        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="pressable flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)] hover:text-[var(--color-heading)]"
        >
          <PanelIcon collapsed={collapsed} />
        </button>
      </div>

      <nav className="flex-1 px-2 pt-3">
        <ul className="space-y-0.5">
          {MAIN.map((item) => (
            <NavItem key={item.href} {...item} pathname={pathname} collapsed={collapsed} />
          ))}
        </ul>

        {!collapsed && <p className="eyebrow px-2 pt-6 pb-2">Others</p>}
        <ul className={`space-y-0.5 ${collapsed ? "mt-2" : ""}`}>
          {OTHER.map((item) => (
            <NavItem key={item.href} {...item} pathname={pathname} collapsed={collapsed} />
          ))}
        </ul>
      </nav>

      {!collapsed && (
        <div className="border-t border-[var(--color-border)] p-4">
          <p className="text-2xs text-[var(--color-muted)]">
            Snapshots rebuild nightly. Options pricing is as of the last run, never live on page
            load.
          </p>
        </div>
      )}
    </aside>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  pathname,
  collapsed,
}: {
  href: string;
  label: string;
  icon: () => React.ReactElement;
  pathname: string;
  collapsed: boolean;
}) {
  // Ticker pages are reached from the calendar, so highlight Calendar while
  // you're on one — otherwise the sidebar shows nothing active and the user
  // loses their sense of place.
  const active = pathname === href || (href === "/calendar/" && pathname.startsWith("/t/"));

  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        title={collapsed ? label : undefined}
        className={`pressable flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 text-sm transition-colors ${
          collapsed ? "justify-center" : ""
        } ${
          active
            ? "bg-[var(--color-brand)] text-[var(--color-on-brand)]"
            : "text-[var(--color-body)] hover:bg-[var(--color-panel-soft)]"
        }`}
      >
        <Icon />
        {!collapsed && label}
      </Link>
    </li>
  );
}

/* ---- icons: 16px, 1.5 stroke, currentColor so they inherit the nav state ---- */

const svg = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function GridIcon() {
  return (
    <svg {...svg}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  );
}

function TickerIcon() {
  return (
    <svg {...svg}>
      <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
      <path d="M4.5 7h2M4.5 9.5h4" />
      <path d="M10 6.5l1.5 3 1-1.8" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...svg}>
      <rect x="2" y="3" width="12" height="11" rx="1" />
      <path d="M2 6.5h12M5.5 2v2M10.5 2v2" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg {...svg}>
      <path d="M1.5 8h3l2-5 3 10 2-5h3" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg {...svg}>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2.5" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg {...svg}>
      <path d="M2 8a6 6 0 1 0 1.8-4.3" />
      <path d="M2 2.5V6h3.5" />
      <path d="M8 5v3.2l2.2 1.3" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg {...svg}>
      <path d="M2.5 3h4a2 2 0 0 1 2 2v8a1.5 1.5 0 0 0-1.5-1.5h-4.5z" />
      <path d="M13.5 3h-4a2 2 0 0 0-2 2v8a1.5 1.5 0 0 1 1.5-1.5h4.5z" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg {...svg}>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.1 6.2a1.9 1.9 0 0 1 3.7.6c0 1.3-1.8 1.5-1.8 2.7" />
      <path d="M8 11.6v.1" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Standard "toggle sidebar" glyph — a panel with its left column filled — the
 * same shape apps like Notion and Linear use, and legible without a label.
 * The filled column swaps sides with `collapsed` so the icon itself always
 * shows which column is expanding, not just a generic arrow.
 */
function PanelIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg {...svg}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M6.5 3v10" />
      {collapsed ? (
        <path
          d="M6.5 3v10H12.5a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 12.5 3z"
          fill="currentColor"
          stroke="none"
        />
      ) : (
        <path
          d="M2 4.5A1.5 1.5 0 0 1 3.5 3H6.5V13H3.5A1.5 1.5 0 0 1 2 11.5z"
          fill="currentColor"
          stroke="none"
        />
      )}
    </svg>
  );
}
