import { pct } from "@/lib/format";
import type { TrackRecordPage } from "@/lib/types";

/**
 * The September 2026 restatement, said plainly where the numbers live.
 *
 * An implied move only measures the earnings move when the option expires
 * right after the report. Names without weekly options had been priced off
 * the next monthly, weeks later, which inflates the implied move and makes
 * RICH look right by construction. Those calls are now excluded from every
 * rich/cheap figure; this note shows what changed and by how much, so the
 * correction is visible rather than a number that quietly moved.
 *
 * Renders nothing when nothing was excluded.
 */
export function RestatementNote({ record }: { record: TrackRecordPage }) {
  const excluded = record.excluded_far_expiry ?? 0;
  if (excluded === 0) return null;

  const allN = record.all_directional ?? 0;
  const allRight = record.all_correct ?? 0;
  const farRight = allRight - record.correct;
  const farRate = excluded > 0 ? farRight / excluded : null;
  const unverified = record.unverified ?? 0;

  return (
    <aside className="rounded-[var(--radius-panel)] border border-[var(--color-warning)]/35 bg-[var(--color-warning-bg)] px-5 py-4">
      <p className="font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--color-warning)] uppercase">
        Restated · September 2026
      </p>
      <p className="mt-1.5 text-lg font-semibold text-[var(--color-heading)]">
        Calls measured off a far expiry no longer count.
      </p>
      <div className="mt-1.5 max-w-4xl space-y-2 text-[var(--color-body)]">
        <p>
          An implied move only measures the earnings move when the option expires right after
          the report. For stocks without weekly options we had been pricing off the next monthly
          expiry, often a month later. That straddle carries weeks of ordinary volatility, so
          the implied move came out too big and RICH looked right almost by construction
          {farRate !== null && (
            <> (those calls were &ldquo;right&rdquo; {pct(farRate, 0)} of the time)</>
          )}
          .
        </p>
        <p>
          We now count a rich/cheap call only when its option expired within a week of the
          report. That leaves out <strong>{excluded}</strong> calls. Accuracy on the remaining{" "}
          <strong>{record.directional}</strong> is{" "}
          <strong>
            {record.accuracy === null ? "not yet measurable" : pct(record.accuracy, 0)}
          </strong>
          , against{" "}
          {record.all_accuracy == null ? "the old figure" : pct(record.all_accuracy, 0)} on all{" "}
          {allN} before. Stocks with no expiry close to the report now show &ldquo;not priced
          yet&rdquo; instead of a verdict.
          {unverified > 0 &&
            ` ${unverified} older call${unverified === 1 ? "" : "s"} with no expiry on file ${unverified === 1 ? "is" : "are"} left out too.`}
        </p>
      </div>
    </aside>
  );
}
