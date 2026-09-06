import type { TickerIndexEntry } from "@/lib/types";

/**
 * A page's title header — the eyebrow + H1 that opens each app page.
 *
 * Navigation, search, and the mobile menu moved to the global TopNav, so this
 * is now just the page's own heading, sitting at the top of its content
 * column rather than in a bordered bar. `tickers` is accepted (and ignored)
 * so the many call sites that still pass it keep type-checking; the global nav
 * owns search now.
 */
export function TopBar({
  title,
  eyebrow,
}: {
  title: string;
  eyebrow?: string;
  tickers?: TickerIndexEntry[];
}) {
  return (
    <div className="px-6 pt-7 pb-1">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="display text-2xl">{title}</h1>
    </div>
  );
}
