import type { ReactNode } from "react";

/**
 * A 3px brand-gradient hairline along a card's top edge — the one place
 * --gradient-brand is allowed outside the marketing hero. Deliberately not a
 * colored surface: `inset-x-0 top-0 h-[3px]` clipped to the parent's radius
 * by the parent's own `overflow-hidden`, so it reads as a seam of color, not
 * a decorative block sitting behind data.
 */
function PanelAccent() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-0 top-0 h-[3px]"
      style={{ background: "var(--gradient-brand)" }}
    />
  );
}

/**
 * Vertical's card: flat, bordered, static. White on the gray page, separated
 * by a 1px border and a 4px radius. No shadow, no hover lift, no glow — depth
 * is the surface change, not an effect. The one added texture is the top-edge
 * brand hairline (PanelAccent) every Panel/StatCard now carries.
 */
export function Panel({
  title,
  subtitle,
  action,
  empty,
  children,
  bodyClassName = "px-5 py-5",
}: {
  /**
   * Optional: a panel living inside a tab whose tab label already names it
   * (the "Recent news" tab holding a "Recent news" panel) should omit this
   * rather than repeat the label as a heading right below it. Pass it when
   * the panel needs its own name — most panels outside a tab context do.
   */
  title?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /**
   * The database currently holds 54 signals across 39 tickers, so most panels
   * render with one or two rows or nothing at all. A panel that explains its
   * own emptiness reads as intentional; a bare heading reads as broken.
   */
  empty?: string;
  children?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-panel)]">
      <PanelAccent />
      {(title || subtitle || action) && (
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            {title && (
              <h2 className="text-[15px] font-medium text-[var(--color-heading)]">{title}</h2>
            )}
            {subtitle && <p className="mt-1 text-sm text-[var(--color-body)]">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}

      {empty ? (
        <p className="px-5 py-8 text-sm text-[var(--color-muted)]">{empty}</p>
      ) : (
        <div className={bodyClassName}>{children}</div>
      )}
    </section>
  );
}

/**
 * A stat tile: mono uppercase eyebrow, then the value in large Inter.
 *
 * `hint` carries the plain-English meaning — this app puts terms like "put/call
 * ratio" and "IV term structure" in front of people who may be meeting them for
 * the first time.
 *
 * The value uses proportional figures, not tabular: `tabular-nums` gives every
 * digit the width of a zero, which looks loose at display sizes. Tabular is for
 * columns that must align (see the history table).
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "rich" | "cheap" | "muted";
  delta?: ReactNode;
}) {
  const toneClass = {
    default: "text-[var(--color-heading)]",
    rich: "text-[var(--color-verdict-rich)]",
    cheap: "text-[var(--color-verdict-cheap)]",
    muted: "text-[var(--color-muted)]",
  }[tone];

  return (
    <div title={hint}>
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1.5 text-2xl font-semibold ${toneClass}`}>{value}</dd>
      {delta && <div className="mt-1 text-sm">{delta}</div>}
    </div>
  );
}

/**
 * A stat tile in its own bordered card — Vertical's KPI row treatment, where
 * each metric sits on its own white panel rather than sharing one.
 */
export function StatCard(props: Parameters<typeof Stat>[0]) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-panel)] px-5 py-4">
      <PanelAccent />
      <Stat {...props} />
    </div>
  );
}

/** Section kicker — the mono uppercase label that sits above a page heading. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}
