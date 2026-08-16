"use client";

/**
 * Client-side pagination over an already-loaded, already-filtered array.
 *
 * Every table in this app fetches its full dataset once (the tracked
 * universe, the signals feed) and filters/sorts it in the browser — there's
 * no server round trip to page against, so this just slices `rows` and
 * renders Prev/Next plus an "X-Y of Z" readout. Shared between the Tickers
 * screener and the Signals feed rather than each rolling its own.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3">
      <span className="text-2xs text-[var(--color-muted)]">
        {start}-{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="pressable rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-sm text-[var(--color-body)] transition-colors hover:bg-[var(--color-panel-soft)] disabled:pointer-events-none disabled:opacity-40"
        >
          Prev
        </button>
        <span className="text-2xs tnum text-[var(--color-muted)]">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="pressable rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-sm text-[var(--color-body)] transition-colors hover:bg-[var(--color-panel-soft)] disabled:pointer-events-none disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
