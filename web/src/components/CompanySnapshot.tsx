import { InfoTip } from "@/components/InfoTip";
import { Panel } from "@/components/Panel";
import { money, moneyCompact, num } from "@/lib/format";
import type { Fundamentals } from "@/lib/types";

/**
 * The at-a-glance company context on the ticker Overview — market cap, the
 * headline multiples, EPS, and where the price sits in its 52-week range.
 * The full ratio grid lives in the Financials tab; this is the "quick, do I
 * need to open that" summary, with the same tap-to-explain tooltips.
 */

interface Metric {
  label: string;
  value: string;
  hint: string;
}

export function CompanySnapshot({
  data,
  spot,
  action,
}: {
  data: Fundamentals | null | undefined;
  spot: number | null | undefined;
  /** e.g. a "Full key figures →" link that switches to the Financials tab. */
  action?: React.ReactNode;
}) {
  if (!data) return null;

  const metrics: Metric[] = [
    {
      label: "Market cap",
      value: moneyCompact(data.market_cap),
      hint: "Total market value of all outstanding shares — the most common measure of company size.",
    },
    {
      label: "P/E (TTM)",
      value: num(data.trailing_pe),
      hint: "Price divided by the last 12 months of earnings per share — dollars paid per dollar of profit.",
    },
    {
      label: "P/S (TTM)",
      value: num(data.price_to_sales),
      hint: "Price relative to the last 12 months of revenue per share.",
    },
    {
      label: "EPS (TTM)",
      value: money(data.trailing_eps),
      hint: "Earnings per share over the last 12 months.",
    },
  ];

  const low = data.fifty_two_week_low;
  const high = data.fifty_two_week_high;
  const rangeOk =
    typeof low === "number" &&
    typeof high === "number" &&
    high > low &&
    typeof spot === "number";
  // Clamp so a spot momentarily outside the trailing range (a fresh high/low
  // the 52-week figures haven't caught up to) still renders inside the bar.
  const posPct = rangeOk ? Math.max(0, Math.min(1, (spot! - low!) / (high! - low!))) * 100 : 0;

  return (
    <Panel title="Company snapshot" action={action}>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label}>
            <dt className="eyebrow text-[var(--color-muted)]">
              <InfoTip label={m.label} description={m.hint} />
            </dt>
            <dd className="tnum mt-1.5 text-base font-semibold text-[var(--color-heading)]">
              {m.value}
            </dd>
          </div>
        ))}
      </dl>

      {rangeOk && (
        <div className="mt-6 border-t border-[var(--color-border-subtle)] pt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="eyebrow text-[var(--color-muted)]">52-week range</span>
            <span className="tnum text-sm text-[var(--color-body)]">
              {money(spot)} · {posPct.toFixed(0)}%
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-[var(--color-border)]">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${posPct}%`,
                background:
                  "linear-gradient(90deg, color-mix(in srgb, var(--color-viz-sma) 40%, var(--color-border)), var(--color-viz-sma))",
              }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--color-panel)] bg-[var(--color-viz-sma)]"
              style={{ left: `${posPct}%` }}
            />
          </div>
          <div className="tnum mt-2 flex justify-between text-xs text-[var(--color-muted)]">
            <span>{money(low)}</span>
            <span>{money(high)}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Whether there's enough to bother rendering the snapshot at all, so Overview
 * doesn't show a bare "Company snapshot" card over nothing. */
export function hasSnapshot(data: Fundamentals | null | undefined): boolean {
  return Boolean(
    data &&
    (typeof data.market_cap === "number" ||
      typeof data.trailing_pe === "number" ||
      typeof data.trailing_eps === "number"),
  );
}
