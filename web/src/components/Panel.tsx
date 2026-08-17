import type { ReactNode } from "react";

/**
 * White card on the warm cream page, lifted by a whisper-soft layered
 * shadow (--shadow-card) rather than a border-only flatness. No hover lift,
 * no glow: the shadow is constant, not an interaction effect. The title (if
 * given) carries the one gradient text treatment in the app — --gradient-
 * brand via bg-clip-text — which is why titles stay short, sentence-style
 * labels rather than data: a gradient reads worse the longer the string.
 * The subtitle gets a solid --color-brand-muted instead of a second
 * gradient, both because it's often a full sentence and because the dark-
 * mode gradient's own dark stop was briefly too close to the dark panel
 * color to read reliably — --color-brand-muted is a plain, contrast-
 * checked color precisely so this doesn't repeat.
 * The header band itself carries a diagonal navy wash (--gradient-panel-
 * header) so cards read as colored at a glance, not just white-with-a-
 * navy-heading — kept to the header only (not the body) so dense data
 * underneath stays on a plain, high-contrast surface.
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
    <section
      className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-panel)]"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {(title || subtitle || action) && (
        <header
          className="flex flex-wrap items-baseline justify-between gap-3 rounded-t-[var(--radius-panel)] border-b border-[var(--color-border)] px-5 py-4"
          style={{ backgroundImage: "var(--gradient-panel-header)" }}
        >
          <div>
            {title && (
              <h2
                className="bg-clip-text text-[15px] font-semibold text-transparent"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-[var(--color-brand-muted)]">{subtitle}</p>
            )}
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
    <div
      className="rounded-[var(--radius-panel)] border border-[var(--color-border)] bg-[var(--color-panel)] px-5 py-4"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <Stat {...props} />
    </div>
  );
}

/** Section kicker — the mono uppercase label that sits above a page heading. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}
