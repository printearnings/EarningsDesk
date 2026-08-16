import { MobileNav } from "@/components/MobileNav";
import { TickerSearch } from "@/components/TickerSearch";
import type { TickerIndexEntry } from "@/lib/types";

/**
 * App top bar: (below `lg`, where the Sidebar is hidden) the mobile nav
 * trigger on the left, page title in the middle, ticker search on the right.
 *
 * The trigger sits on the left because the drawer it opens slides in from
 * the left — the standard pairing (Gmail, most dashboards): the drawer reads
 * as unfolding from the button that opened it, rather than sliding in from
 * the opposite side of the screen from its own trigger.
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
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-panel)]">
      <div className="flex items-center gap-3 px-6 py-3">
        <MobileNav />

        <div className="min-w-0 flex-1">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="display truncate text-2xl">{title}</h1>
        </div>

        {/* `compact`'s own w-9→sm:w-full behavior only reads correctly if
            this wrapper doesn't force a width of its own below `sm` — it used
            to, which was *why* a 36px icon still claimed a full flex row and
            pushed the nav below it. */}
        <div className="w-auto shrink-0 sm:w-full sm:max-w-xs">
          <TickerSearch tickers={tickers} compact />
        </div>
      </div>
    </header>
  );
}
