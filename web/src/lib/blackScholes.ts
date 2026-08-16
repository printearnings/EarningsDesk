/**
 * Black-Scholes repricing for the options P&L simulator.
 *
 * The Worker's /api/chain hands over each contract's OWN delta/theta/vega
 * from Massive, which describe the contract at its CURRENT spot/IV/time —
 * useful for display, useless for "what if the stock moves 8% and IV
 * crashes 40%": those greeks are a local linear approximation, and an
 * earnings move is exactly the large, nonlinear case where that
 * approximation breaks down. Repricing the option from scratch at a
 * hypothetical spot/IV/time is the only way to get an honest curve.
 *
 * European exercise is assumed (matching every mainstream retail P&L
 * calculator, e.g. optionsprofitcalculator.com) even though equity options
 * are American — early exercise is rarely optimal before expiration for a
 * non-dividend-paying case, and modeling it properly needs a binomial tree,
 * which is more complexity than a "should I take this earnings trade"
 * simulator needs.
 */

export type OptionType = "call" | "put";

// A fixed assumption, not fetched live — the curve is far more sensitive to
// the IV crush and the spot move than to a point or two of rate, and the
// existing engine doesn't already carry a live risk-free rate anywhere for
// this to reuse.
export const DEFAULT_RISK_FREE_RATE = 0.045;

/** Zelen & Severo's rational approximation — ~7.5e-8 max error, the
 * standard closed-form stand-in for the normal CDF in quant code that
 * doesn't want a full erf implementation. */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let prob =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
}

function intrinsicValue(type: OptionType, spot: number, strike: number): number {
  return type === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
}

export interface BlackScholesInputs {
  type: OptionType;
  spot: number;
  strike: number;
  /** Years to expiration. <= 0 collapses to intrinsic value — there's no
   * time value left to price. */
  yearsToExpiry: number;
  /** Annualized IV as a decimal (0.35 = 35%). <= 0 also collapses to
   * intrinsic — a zero-vol option has no time value either. */
  iv: number;
  riskFreeRate?: number;
}

export function blackScholesPrice({
  type,
  spot,
  strike,
  yearsToExpiry,
  iv,
  riskFreeRate = DEFAULT_RISK_FREE_RATE,
}: BlackScholesInputs): number {
  if (yearsToExpiry <= 0 || iv <= 0 || spot <= 0 || strike <= 0) {
    return intrinsicValue(type, spot, strike);
  }

  const sqrtT = Math.sqrt(yearsToExpiry);
  const d1 =
    (Math.log(spot / strike) + (riskFreeRate + (iv * iv) / 2) * yearsToExpiry) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const discount = Math.exp(-riskFreeRate * yearsToExpiry);

  return type === "call"
    ? spot * normalCdf(d1) - strike * discount * normalCdf(d2)
    : strike * discount * normalCdf(-d2) - spot * normalCdf(-d1);
}

export interface PositionInputs {
  type: OptionType;
  strike: number;
  /** Premium paid per share (i.e. per-contract price ÷ 1, not × 100). */
  entryPremium: number;
  contracts: number;
  /** Years to expiry AS OF the entry point this scenario is evaluated from. */
  yearsToExpiry: number;
  iv: number;
  riskFreeRate?: number;
}

/** A long option's own $100/point multiplier — every US equity option
 * contract, no exceptions this app deals with (index/mini contracts aren't
 * in the tracked universe). */
export const CONTRACT_MULTIPLIER = 100;

/** Theoretical value + P&L for one scenario: a hypothetical spot, with
 * `yearsToExpiry`/`iv` already carrying whatever time-decay and IV-crush
 * assumption the caller wants modeled. Long-only (buying a call or a put) —
 * this simulator doesn't build spreads. */
export function positionPnl(
  inputs: PositionInputs,
  hypotheticalSpot: number,
): { valuePerShare: number; totalValue: number; pnl: number; pnlPct: number } {
  const valuePerShare = blackScholesPrice({
    type: inputs.type,
    spot: hypotheticalSpot,
    strike: inputs.strike,
    yearsToExpiry: inputs.yearsToExpiry,
    iv: inputs.iv,
    riskFreeRate: inputs.riskFreeRate,
  });
  const totalValue = valuePerShare * inputs.contracts * CONTRACT_MULTIPLIER;
  const totalCost = inputs.entryPremium * inputs.contracts * CONTRACT_MULTIPLIER;
  const pnl = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? pnl / totalCost : 0;
  return { valuePerShare, totalValue, pnl, pnlPct };
}

/** Breakeven at expiration — the one spot price where intrinsic value
 * exactly equals the premium paid. Closed-form, no need to search the
 * payoff curve for it. */
export function breakevenAtExpiry(
  type: OptionType,
  strike: number,
  entryPremium: number,
): number {
  return type === "call" ? strike + entryPremium : strike - entryPremium;
}
