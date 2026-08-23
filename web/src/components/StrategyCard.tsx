import { Panel } from "@/components/Panel";
import { type Direction, type Verdict, recommendStrategy } from "@/lib/strategy";

/**
 * The structure this setup suggests — the layer above the verdict and
 * direction chips, which each state one fact but leave "so what do I
 * actually do with that" to the reader.
 *
 * Deliberately shows the STRUCTURE only, not strikes: strike selection
 * needs a live chain (a metered call), and this panel renders for every
 * ticker from data the nightly snapshot already carries. The Simulator
 * below is where a reader goes to price actual legs.
 *
 * The disclaimer is not boilerplate here. Naming a specific structure
 * reads as more prescriptive than "the flow leans bullish", so the framing
 * has to work harder to stay on the right side of informational —
 * hence "traders in this setup often use", not "you should".
 */

const BIAS_STYLE: Record<string, string> = {
  bullish:
    "border-[var(--color-direction-bullish)]/25 bg-[var(--color-verdict-cheap-bg)] text-[var(--color-direction-bullish)]",
  bearish:
    "border-[var(--color-direction-bearish)]/25 bg-[var(--color-verdict-rich-bg)] text-[var(--color-direction-bearish)]",
  neutral:
    "border-[var(--color-border)] bg-[var(--color-verdict-fair-bg)] text-[var(--color-direction-neutral)]",
};

const PREMIUM_LABEL: Record<string, string> = {
  sell: "Net credit",
  buy: "Net debit",
  none: "",
};

export function StrategyCard({
  verdict,
  direction,
  ivInverted,
}: {
  verdict: string | null | undefined;
  direction: string | null | undefined;
  ivInverted: boolean | null | undefined;
}) {
  const suggestion = recommendStrategy({
    verdict: (verdict ?? null) as Verdict | null,
    direction: (direction ?? null) as Direction | null,
    ivInverted,
  });

  if (suggestion.type === "none") {
    return (
      <Panel
        title="Structure"
        subtitle="What kind of trade this setup lends itself to"
        empty={suggestion.rationale}
      />
    );
  }

  return (
    <Panel
      title="Structure"
      subtitle="What kind of trade this setup lends itself to — not a recommendation to place one"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-[var(--radius-chip)] border px-2.5 py-1 font-mono text-sm font-medium tracking-[0.06em] uppercase ${
            BIAS_STYLE[suggestion.bias]
          }`}
        >
          {suggestion.label}
        </span>
        {PREMIUM_LABEL[suggestion.premium] && (
          <span className="eyebrow text-[var(--color-muted)]">
            {PREMIUM_LABEL[suggestion.premium]}
          </span>
        )}
        <span className="eyebrow text-[var(--color-muted)]">Defined risk</span>
      </div>

      <p className="mt-4 text-[var(--color-body)]">{suggestion.rationale}</p>

      <p className="mt-4 border-t border-[var(--color-border-subtle)] pt-4 text-sm text-[var(--color-muted)]">
        A structure traders in this setup often use, derived from the verdict and directional
        read above — not advice, and not sized for anyone&rsquo;s account. Strikes depend on the
        live chain; use the simulator to price actual legs.
      </p>
    </Panel>
  );
}
