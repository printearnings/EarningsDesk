/**
 * Shapes and helpers shared by the landing page (a Server Component) and its
 * interactive preview (a Client Component). Kept out of LandingPreview.tsx
 * because a server module can't call a function exported from a "use client"
 * file.
 */

export interface PreviewMove {
  date: string;
  /** Signed close-to-close move across the print, as a fraction. */
  move: number;
}

export interface PreviewTicker {
  ticker: string;
  name: string | null;
  domain: string | null;
  reportDate: string;
  session: string | null;
  verdict: string | null;
  implied: number;
  typical: number | null;
  expiry: string | null;
  /** Oldest -> newest, at most eight. */
  moves: PreviewMove[];
}

/** How many past prints moved further than the move being priced today. */
export function countOutside(t: PreviewTicker): number {
  return t.moves.filter((m) => Math.abs(m.move) > t.implied).length;
}
