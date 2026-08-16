/**
 * ATM straddle selection and implied move.
 *
 * This is the one piece of engine logic that has to exist twice. The Python
 * lives in `earnings/backtest/straddle.py::select_atm_straddle` and
 * `earnings/core/implied_move.py::implied_move_pct`, and it cannot be reused
 * here — Cloudflare Workers run Pyodide, which has no psycopg and can't load
 * yfinance, so the Python never runs at the edge.
 *
 * Kept deliberately small and pure so it can be tested against the same
 * fixtures as the Python, and so the duplication stays auditable. If the
 * Python's selection rule changes, change it here too.
 *
 * The rules, matching the Python exactly:
 *   - only expiries on or after the earnings date (you must own the print)
 *   - the nearest such expiry (front-month captures the event premium)
 *   - the strike closest to spot
 *   - implied move = (call + put) / spot
 */

export interface RawContract {
  details?: {
    contract_type?: string;
    expiration_date?: string;
    strike_price?: number;
    ticker?: string;
  };
  day?: { close?: number; volume?: number };
  last_trade?: { price?: number };
  open_interest?: number;
  implied_volatility?: number;
  // Present on Massive's /v3/snapshot/options response, confirmed by direct
  // API inspection — never read by the straddle/put-call-ratio logic below,
  // only by the P&L simulator's chain endpoint in index.ts.
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
  underlying_asset?: { price?: number };
}

export interface Straddle {
  expiry: string;
  strike: number;
  call: number;
  put: number;
  straddle: number;
  impliedMove: number;
}

/** Last trade preferred, day close as fallback — mirrors the Python. */
function price(c: RawContract): number | null {
  const p = c.last_trade?.price ?? c.day?.close;
  return typeof p === "number" && p > 0 ? p : null;
}

export function underlyingPrice(results: RawContract[]): number | null {
  for (const r of results) {
    const p = r.underlying_asset?.price;
    if (typeof p === "number" && p > 0) return p;
  }
  return null;
}

export function putCallVolume(results: RawContract[]): {
  callVolume: number;
  putVolume: number;
  ratio: number | null;
} {
  let callVolume = 0;
  let putVolume = 0;

  for (const r of results) {
    const vol = r.day?.volume ?? 0;
    if (r.details?.contract_type === "call") callVolume += vol;
    else if (r.details?.contract_type === "put") putVolume += vol;
  }

  // A zero call volume would divide to Infinity. Report null — "we can't
  // compute this" — rather than a number that reads as extreme bearishness.
  const ratio = callVolume > 0 ? putVolume / callVolume : null;
  return { callVolume, putVolume, ratio };
}

export function selectAtmStraddle(
  results: RawContract[],
  spot: number,
  onOrAfter: string,
): Straddle | null {
  if (!results.length || spot <= 0) return null;

  // Group by expiry, keeping only expiries that cover the earnings date.
  const byExpiry = new Map<string, RawContract[]>();
  for (const r of results) {
    const exp = r.details?.expiration_date;
    if (!exp || exp < onOrAfter) continue;
    const list = byExpiry.get(exp) ?? [];
    list.push(r);
    byExpiry.set(exp, list);
  }
  if (byExpiry.size === 0) return null;

  const frontExpiry = [...byExpiry.keys()].sort()[0];
  const chain = byExpiry.get(frontExpiry)!;

  // Strikes that have BOTH a call and a put with a usable price — a straddle
  // needs both legs, and a strike with only one is not a candidate.
  const legs = new Map<number, { call?: number; put?: number }>();
  for (const c of chain) {
    const strike = c.details?.strike_price;
    const type = c.details?.contract_type;
    const p = price(c);
    if (typeof strike !== "number" || p === null) continue;
    if (type !== "call" && type !== "put") continue;

    const entry = legs.get(strike) ?? {};
    entry[type] = p;
    legs.set(strike, entry);
  }

  let best: Straddle | null = null;
  let bestDistance = Infinity;

  for (const [strike, { call, put }] of legs) {
    if (call === undefined || put === undefined) continue;
    const distance = Math.abs(strike - spot);
    if (distance >= bestDistance) continue;

    bestDistance = distance;
    best = {
      expiry: frontExpiry,
      strike,
      call,
      put,
      straddle: call + put,
      impliedMove: (call + put) / spot,
    };
  }

  return best;
}
