/**
 * Shared SVG path builders for the app's hand-rolled charts, so every bar
 * across FinancialsBars, ImpliedVsRealized and OpenInterestChart rounds its
 * end the same way rather than each reinventing an `rx` that rounds all four
 * corners (which looks wrong where a bar meets its baseline).
 */

/**
 * A bar that rounds only the end away from its baseline: the top for a bar
 * growing up from zero, the bottom for one growing down (a loss quarter). The
 * baseline end stays square so the bar reads as anchored, not floating.
 *
 * `x`,`y` are the rect's top-left, `w`/`h` its size, `r` the corner radius
 * (clamped to half the width and the full height so thin or short bars never
 * self-intersect). Coordinates are rounded to 2dp to keep the emitted path
 * compact.
 */
export function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  roundTop = true,
): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  const f = (n: number) => n.toFixed(2);
  const yb = y + h;
  if (roundTop) {
    return [
      `M${f(x)},${f(yb)}`,
      `L${f(x)},${f(y + rr)}`,
      `Q${f(x)},${f(y)} ${f(x + rr)},${f(y)}`,
      `L${f(x + w - rr)},${f(y)}`,
      `Q${f(x + w)},${f(y)} ${f(x + w)},${f(y + rr)}`,
      `L${f(x + w)},${f(yb)}`,
      "Z",
    ].join(" ");
  }
  return [
    `M${f(x)},${f(y)}`,
    `L${f(x + w)},${f(y)}`,
    `L${f(x + w)},${f(yb - rr)}`,
    `Q${f(x + w)},${f(yb)} ${f(x + w - rr)},${f(yb)}`,
    `L${f(x + rr)},${f(yb)}`,
    `Q${f(x)},${f(yb)} ${f(x)},${f(yb - rr)}`,
    "Z",
  ].join(" ");
}

/**
 * A muted fill mixing an accent token toward the panel surface — the "earlier
 * period" tone in a single-series bar chart where the most recent bar carries
 * the full accent. Kept as a helper so the same blend ratio is used everywhere
 * the two-tone treatment appears.
 */
export function mutedFill(colorVar: string, pct = 40): string {
  return `color-mix(in srgb, ${colorVar} ${pct}%, var(--color-panel))`;
}
