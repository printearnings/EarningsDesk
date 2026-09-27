import { pct, pctSigned } from "@/lib/format";
import type { TrackRecordPage } from "@/lib/types";

/**
 * Plain-language readings of the track record that more than one page shows,
 * written once so the signals page, the track record and the ticker header
 * can't drift into saying different things about the same numbers.
 */

export interface CheapStory {
  headline: string;
  body: string;
  caveat: string | null;
}

/**
 * The split between the two kinds of call, led by whichever side actually
 * carried the results. Today that's CHEAP: rare, but buying cheap premium has
 * averaged far more than selling rich. Built from the live numbers, so if
 * that ever flips, the headline flips with it. Null until both sides have a
 * priced average.
 */
export function cheapStory(r: TrackRecordPage): CheapStory | null {
  const sell = r.structure_sell_avg_pnl_pct ?? null;
  const buy = r.structure_buy_avg_pnl_pct ?? null;
  if (sell === null || buy === null) return null;

  const cheapCalls = r.cheap_edge_scored ?? 0;
  const calls = r.directional ?? 0;
  const buyN = r.structure_buy_scored ?? 0;
  const sellN = r.structure_sell_scored ?? 0;

  const headline =
    buy > sell
      ? "The rare CHEAP setups did the heavy lifting."
      : "Selling RICH premium has carried the results so far.";
  const body =
    `Only ${cheapCalls} of ${calls} scored calls were CHEAP. Priced as real trades, ` +
    `buying cheap premium averaged ${pctSigned(buy)} over ${buyN} trades ` +
    `(won ${pct(r.structure_buy_win_rate, 0)}), while selling rich premium averaged ` +
    `${pctSigned(sell)} over ${sellN} (won ${pct(r.structure_sell_win_rate, 0)}). ` +
    `RICH wins more often, in small amounts; CHEAP loses more often but pays when it hits.`;
  const caveat =
    buyN < 50
      ? `${buyN} priced CHEAP trades is still a small sample. Treat the gap as a pattern to watch, not a law.`
      : null;
  return { headline, body, caveat };
}

/**
 * The directional lean is hidden until the engine's gate says it has earned
 * a place (see `direction_earned`). This is the one line that explains why,
 * with the numbers; null once it's earned.
 */
export function directionNote(r: TrackRecordPage): string | null {
  if (r.direction_earned) return null;
  const record =
    typeof r.dir_accuracy === "number"
      ? `right ${pct(r.dir_accuracy, 0)} of the time so far (${r.dir_correct}/${r.dir_scored})`
      : "too new to measure";
  return `The directional lean is experimental: ${record}. It's hidden until it holds 55%+ over 100+ scored reads.`;
}
