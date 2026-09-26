/**
 * Verdict and direction chips.
 *
 * These are two INDEPENDENT axes and the UI must never merge them into one
 * buy/sell score:
 *
 *   verdict   — is the option premium rich or cheap versus this stock's own
 *               history? A pricing claim.
 *   direction — which way is the flow leaning? A movement claim.
 *
 * RICH does not mean "sell" and CHEAP does not mean "buy" — which side you
 * want depends on the position you're building. The engine keeps these
 * separate (see the engine repo's PLAN-BOT.md); collapsing them here would
 * misrepresent what it predicts. Hence separate components with separate
 * tokens, and a tooltip on each saying what it actually means.
 *
 * Styling follows Vertical: 4px radius, 1px border, a hairline tint rather
 * than a saturated block, mono uppercase text.
 */

import type { MacroEventType } from "@/lib/macroEvents";

const VERDICT_MEANING: Record<string, string> = {
  RICH: "Pricing a bigger move than this stock typically makes after earnings.",
  CHEAP: "Pricing a smaller move than this stock typically makes after earnings.",
  FAIR: "Pricing roughly this stock's typical post-earnings move.",
};

const DIRECTION_MEANING: Record<string, string> = {
  BULLISH: "Options flow and sentiment lean upside.",
  BEARISH: "Options flow and sentiment lean downside.",
  NEUTRAL: "No clear lean in flow or sentiment.",
};

const VERDICT_STYLE: Record<string, string> = {
  RICH: "border-[var(--color-verdict-rich)]/25 bg-[var(--color-verdict-rich-bg)] text-[var(--color-verdict-rich)]",
  CHEAP:
    "border-[var(--color-verdict-cheap)]/25 bg-[var(--color-verdict-cheap-bg)] text-[var(--color-verdict-cheap)]",
  FAIR: "border-[var(--color-border)] bg-[var(--color-verdict-fair-bg)] text-[var(--color-verdict-fair)]",
};

const DIRECTION_STYLE: Record<string, string> = {
  BULLISH:
    "border-[var(--color-direction-bullish)]/25 bg-[var(--color-verdict-cheap-bg)] text-[var(--color-direction-bullish)]",
  BEARISH:
    "border-[var(--color-direction-bearish)]/25 bg-[var(--color-verdict-rich-bg)] text-[var(--color-direction-bearish)]",
  NEUTRAL:
    "border-[var(--color-border)] bg-[var(--color-verdict-fair-bg)] text-[var(--color-direction-neutral)]",
};

const BASE =
  "inline-flex items-center rounded-[var(--radius-chip)] border px-1.5 py-0.5 text-[var(--text-2xs)] font-medium uppercase tracking-[0.06em]";

export function VerdictChip({ verdict }: { verdict?: string | null }) {
  if (!verdict) return null;
  return (
    <span
      className={`${BASE} ${VERDICT_STYLE[verdict] ?? VERDICT_STYLE.FAIR}`}
      title={VERDICT_MEANING[verdict]}
    >
      {verdict}
    </span>
  );
}

export function DirectionChip({ direction }: { direction?: string | null }) {
  if (!direction) return null;
  return (
    <span
      className={`${BASE} ${DIRECTION_STYLE[direction] ?? DIRECTION_STYLE.NEUTRAL}`}
      title={DIRECTION_MEANING[direction]}
    >
      {direction}
    </span>
  );
}

const WORKFLOW_LABEL: Record<string, string> = { A: "VOL", B: "DIR" };
const WORKFLOW_MEANING: Record<string, string> = {
  A: "Workflow A: the vol rich/cheap read.",
  B: "Workflow B: the directional (bullish/bearish) read.",
};
const WORKFLOW_STYLE: Record<string, string> = {
  A: "border-[var(--color-brand)]/30 bg-[var(--color-panel-soft)] text-[var(--color-brand)]",
  B: "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-muted)]",
};

/**
 * Which analysis produced this row — Workflow A (vol) or B (direction).
 *
 * Exists because two rows for the same ticker on the Signals feed — one per
 * workflow — read as an accidental duplicate at a glance if the only
 * distinction is small grey parenthetical text. A bordered, colored chip
 * makes it unmistakable that they're two different analyses, not a repeat.
 */
export function WorkflowChip({ workflow }: { workflow: string }) {
  return (
    <span
      className={`${BASE} ${WORKFLOW_STYLE[workflow] ?? WORKFLOW_STYLE.B}`}
      title={WORKFLOW_MEANING[workflow]}
    >
      {WORKFLOW_LABEL[workflow] ?? workflow}
    </span>
  );
}

/**
 * Whether a signal's call turned out right, once the print has happened and
 * the engine has scored it — the accountability piece of the activity feed.
 * A workflow-A (vol) call is scored by `beat_implied`; workflow-B (direction)
 * by `correct_direction`. Both are null until the event happens AND gets
 * scored, which is a normal, common state — not a miss — so it renders as
 * "Pending" rather than defaulting to either Hit or Miss.
 */
export function ResultChip({
  workflow,
  beatImplied,
  correctDirection,
}: {
  workflow: string;
  beatImplied?: boolean | null;
  correctDirection?: boolean | null;
}) {
  const hit = workflow === "A" ? beatImplied : correctDirection;

  if (hit === null || hit === undefined) {
    return <span className="text-2xs text-[var(--color-muted)]">Pending</span>;
  }

  return (
    <span
      className={`${BASE} ${
        hit
          ? "border-[var(--color-positive)]/25 bg-[var(--color-verdict-cheap-bg)] text-[var(--color-positive)]"
          : "border-[var(--color-negative)]/25 bg-[var(--color-verdict-rich-bg)] text-[var(--color-negative)]"
      }`}
      title={
        workflow === "A"
          ? "Realized move vs. priced-in implied move."
          : "Stock move vs. called direction."
      }
    >
      {hit ? "Hit" : "Miss"}
    </span>
  );
}

/**
 * Before/after the bell. Rendered only when known — an absent session is
 * genuinely unknown (Yahoo supplies a midday placeholder for "time not
 * supplied"), and guessing would tell someone to hold a position through the
 * wrong side of a print.
 */
export function SessionChip({ session }: { session?: string | null }) {
  if (session !== "BMO" && session !== "AMC") return null;
  return (
    <span
      className={`${BASE} border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--color-muted)]`}
      title={session === "BMO" ? "Reports before the open" : "Reports after the close"}
    >
      {session}
    </span>
  );
}

const MACRO_EVENT_STYLE: Record<string, string> = {
  // Reuses the SMA/EMA overlay pair from the price chart rather than
  // inventing a new pair — those two were already run through the CVD
  // validator for both light and dark surfaces, so borrowing them here is
  // free instead of re-earning a colorblind-safe pair from scratch.
  FOMC: "border-[var(--color-viz-sma)]/25 bg-[var(--color-viz-sma)]/10 text-[var(--color-viz-sma)]",
  CPI: "border-[var(--color-viz-ema)]/25 bg-[var(--color-viz-ema)]/10 text-[var(--color-viz-ema)]",
  // Amber and green extend the FOMC/CPI blue/purple pair — four distinct hues,
  // all already CVD-validated tokens (see the note above).
  PPI: "border-[var(--color-viz-realized)]/25 bg-[var(--color-viz-realized)]/10 text-[var(--color-viz-realized)]",
  JOBS: "border-[var(--color-positive)]/25 bg-[var(--color-positive)]/10 text-[var(--color-positive)]",
};

export function MacroEventChip({ type }: { type: MacroEventType }) {
  return <span className={`${BASE} ${MACRO_EVENT_STYLE[type]}`}>{type}</span>;
}

/**
 * The small signed figure under a stat — Vertical's KPI delta treatment.
 * The arrow is a second channel so the meaning doesn't rest on colour alone.
 */
export function Delta({
  value,
  suffix,
  goodWhen = "up",
}: {
  value: number | null | undefined;
  suffix?: string;
  /** Set "down" where a falling number is the good outcome. */
  goodWhen?: "up" | "down";
}) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const rising = value > 0;
  const good = goodWhen === "up" ? rising : !rising;
  const color = good ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]";

  return (
    <span className={`tnum inline-flex items-center gap-1 ${color}`}>
      <span aria-hidden>{rising ? "↗" : "↘"}</span>
      {rising ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}
