import { Panel } from "@/components/Panel";
import { EMPTY, formatDateShort, money } from "@/lib/format";
import type { AnalystRatingRow } from "@/lib/types";

/**
 * Analyst upgrade/downgrade history — who changed their call, when, and
 * what they moved the price target to.
 *
 * The aggregate consensus already sits in the key-figures grid; this is
 * the timeline behind it, which is the part that actually moves a stock
 * into a print. A cluster of downgrades the week before earnings is a
 * different setup than a stale "buy" from eight months ago.
 */

const ACTION_LABEL: Record<string, string> = {
  up: "Upgrade",
  down: "Downgrade",
  init: "Initiated",
  main: "Maintained",
  reit: "Reiterated",
};

const ACTION_STYLE: Record<string, string> = {
  up: "border-[var(--color-positive)]/25 bg-[var(--color-verdict-cheap-bg)] text-[var(--color-positive)]",
  down: "border-[var(--color-negative)]/25 bg-[var(--color-verdict-rich-bg)] text-[var(--color-negative)]",
};

const NEUTRAL_STYLE =
  "border-[var(--color-border)] bg-[var(--color-verdict-fair-bg)] text-[var(--color-muted)]";

function ActionChip({ action }: { action: string | null | undefined }) {
  if (!action) return <span className="text-[var(--color-muted)]">{EMPTY}</span>;
  return (
    <span
      className={`text-2xs inline-flex items-center rounded-[var(--radius-chip)] border px-1.5 py-0.5 font-mono font-medium tracking-[0.06em] whitespace-nowrap uppercase ${
        ACTION_STYLE[action] ?? NEUTRAL_STYLE
      }`}
    >
      {ACTION_LABEL[action] ?? action}
    </span>
  );
}

/** "Hold → Buy" when the grade actually moved, just the new grade when it
 * didn't (a maintain/reiterate), an em dash when neither is known. */
function gradeChange(from: string | null | undefined, to: string | null | undefined) {
  if (!to) return EMPTY;
  if (!from || from === to) return to;
  return `${from} → ${to}`;
}

/** A target that moved renders both sides; one that didn't renders once.
 * Both null is a real case — plenty of actions carry no target at all. */
function targetChange(prior: number | null | undefined, current: number | null | undefined) {
  if (current === null || current === undefined) return EMPTY;
  if (prior === null || prior === undefined) return money(current);
  if (prior === current) return money(current);
  return `${money(prior)} → ${money(current)}`;
}

export function AnalystRatings({ rows }: { rows: AnalystRatingRow[] }) {
  if (rows.length === 0) {
    return (
      <Panel
        title="Analyst actions"
        subtitle="Upgrades, downgrades, and price-target changes"
        empty="No recent analyst coverage for this symbol."
      />
    );
  }

  return (
    <Panel
      title="Analyst actions"
      subtitle="Upgrades, downgrades, and price-target changes — newest first"
      bodyClassName="px-0 py-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-table-head)] text-left">
              <th className="eyebrow px-4 py-2.5 font-medium">Date</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Firm</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Action</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Rating</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Price target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.date}-${r.firm}-${i}`}
                className="border-b border-[var(--color-border-subtle)] last:border-b-0"
              >
                <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                  {formatDateShort(r.date)}
                </td>
                <td className="px-4 py-2.5 font-medium text-[var(--color-heading)]">
                  {r.firm ?? EMPTY}
                </td>
                <td className="px-4 py-2.5">
                  <ActionChip action={r.action} />
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                  {gradeChange(r.from_grade, r.to_grade)}
                </td>
                <td className="tnum px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                  {targetChange(r.prior_price_target, r.current_price_target)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
