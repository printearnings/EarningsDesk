"use client";

import { useMemo } from "react";

import { Panel } from "@/components/Panel";
import { EMPTY, formatDateShort, money, num } from "@/lib/format";
import {
  type ChainContract,
  type Direction,
  type Verdict,
  recommendStrategy,
  selectStrikes,
  strategyEconomics,
} from "@/lib/strategy";

/**
 * The suggested structure resolved into actual contracts — the step
 * between "an iron condor fits this setup" (the Structure card) and
 * "here is what it costs and what it risks".
 *
 * Runs off the chain the Simulator has already fetched, so it costs no
 * extra metered call. Read-only by design: this is a worked example of
 * the structure, not an order ticket, and the single-leg simulator above
 * remains the place to actually price a position you're building.
 *
 * Everything is per one contract of each leg. Multiplying for size is the
 * reader's decision, and showing a number that silently assumed a
 * quantity would misstate the risk.
 */

const ACTION_STYLE: Record<string, string> = {
  buy: "border-[var(--color-positive)]/25 bg-[var(--color-verdict-cheap-bg)] text-[var(--color-positive)]",
  sell: "border-[var(--color-negative)]/25 bg-[var(--color-verdict-rich-bg)] text-[var(--color-negative)]",
};

export function StrategyLegs({
  verdict,
  direction,
  ivInverted,
  contracts,
  expiry,
}: {
  verdict: string | null | undefined;
  direction: string | null | undefined;
  ivInverted: boolean | null | undefined;
  contracts: ChainContract[];
  expiry: string;
}) {
  const suggestion = recommendStrategy({
    verdict: (verdict ?? null) as Verdict | null,
    direction: (direction ?? null) as Direction | null,
    ivInverted,
  });

  const plan = useMemo(
    () => (suggestion.type === "none" ? null : selectStrikes(suggestion.type, contracts, expiry)),
    [suggestion.type, contracts, expiry],
  );
  const econ = useMemo(() => (plan ? strategyEconomics(plan) : null), [plan]);

  if (suggestion.type === "none" || !plan) return null;

  if (!plan.complete) {
    return (
      <Panel
        title={`Suggested structure · ${suggestion.label}`}
        empty={
          // Distinct from "no structure fits": one does, the chain just
          // doesn't list every strike it needs at this expiry.
          "This expiry's chain doesn't carry every strike this structure needs. Try another expiration."
        }
      />
    );
  }

  const isCredit = econ !== null && econ.netCredit > 0;

  return (
    <Panel
      title={`Suggested structure · ${suggestion.label}`}
      subtitle={`Built from the loaded chain at ${formatDateShort(expiry)}. One contract per leg — an illustration, not an order.`}
      bodyClassName="px-0 py-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-table-head)] text-left">
              <th className="eyebrow px-4 py-2.5 font-medium">Action</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Contract</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Expiry</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Delta</th>
              <th className="eyebrow px-4 py-2.5 font-medium">Price</th>
            </tr>
          </thead>
          <tbody>
            {plan.legs.map((leg, i) => {
              const c = leg.contract!;
              return (
                <tr
                  key={`${leg.action}-${c.type}-${c.strike}-${i}`}
                  className="border-b border-[var(--color-border-subtle)] last:border-b-0"
                >
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-2xs inline-flex items-center rounded-[var(--radius-chip)] border px-1.5 py-0.5 font-mono font-medium tracking-[0.06em] uppercase ${ACTION_STYLE[leg.action]}`}
                    >
                      {leg.action}
                    </span>
                  </td>
                  <td className="tnum px-4 py-2.5 font-medium whitespace-nowrap text-[var(--color-heading)]">
                    {money(c.strike, 2)} {c.type}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-[var(--color-body)]">
                    {formatDateShort(c.expiry)}
                  </td>
                  <td
                    className="tnum px-4 py-2.5 text-[var(--color-body)]"
                    title={`Targeted ~${(leg.targetDelta * 100).toFixed(0)}Δ`}
                  >
                    {c.delta !== null ? num(Math.abs(c.delta), 2) : EMPTY}
                  </td>
                  <td className="tnum px-4 py-2.5 text-[var(--color-body)]">
                    {c.price !== null ? money(c.price) : EMPTY}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {econ && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--color-border)] px-5 py-4 sm:grid-cols-4">
          <div>
            <p className="eyebrow text-[var(--color-muted)]">
              {isCredit ? "Net credit" : "Net debit"}
            </p>
            <p className="tnum mt-1 text-lg font-semibold text-[var(--color-heading)]">
              {money(Math.abs(econ.netCredit))}
            </p>
          </div>
          <div>
            <p className="eyebrow text-[var(--color-muted)]">Max profit</p>
            <p className="tnum mt-1 text-lg font-semibold text-[var(--color-positive)]">
              {/* Unbounded upside is not a number. Rendering a cap here
                  would understate exactly what a long straddle is for. */}
              {econ.maxProfit === null ? "Unlimited" : money(econ.maxProfit)}
            </p>
          </div>
          <div>
            <p className="eyebrow text-[var(--color-muted)]">Max loss</p>
            <p className="tnum mt-1 text-lg font-semibold text-[var(--color-negative)]">
              {econ.maxLoss === null ? EMPTY : money(econ.maxLoss)}
            </p>
          </div>
          <div>
            <p className="eyebrow text-[var(--color-muted)]">
              Breakeven{econ.breakevens.length > 1 ? "s" : ""}
            </p>
            <p className="tnum mt-1 text-lg font-semibold text-[var(--color-heading)]">
              {econ.breakevens.length === 0
                ? EMPTY
                : econ.breakevens.map((b) => money(b)).join(" / ")}
            </p>
          </div>
        </div>
      )}

      <p className="border-t border-[var(--color-border-subtle)] px-5 py-4 text-sm text-[var(--color-muted)]">
        {econ?.maxLoss === null
          ? "Legs expire on different dates, so there's no single expiration payoff to take a max over — the debit shown is what it costs to open."
          : "At expiration, per one contract of each leg, before commissions and assuming both sides fill at the quoted price."}
      </p>
    </Panel>
  );
}
