"use client";

export const VERDICTS = ["RICH", "CHEAP", "FAIR"] as const;
export const DIRECTIONS = ["BULLISH", "BEARISH", "NEUTRAL"] as const;
export const SESSIONS = ["BMO", "AMC"] as const;

export const VERDICT_DOT: Record<string, string> = {
  RICH: "bg-[var(--color-verdict-rich)]",
  CHEAP: "bg-[var(--color-verdict-cheap)]",
  FAIR: "bg-[var(--color-verdict-fair)]",
};

export const DIRECTION_DOT: Record<string, string> = {
  BULLISH: "bg-[var(--color-direction-bullish)]",
  BEARISH: "bg-[var(--color-direction-bearish)]",
  NEUTRAL: "bg-[var(--color-direction-neutral)]",
};

// BMO/AMC isn't a value judgment like verdict or direction — SessionChip
// renders both the same neutral muted color, and the filter dot matches.
export const SESSION_DOT: Record<string, string> = {
  BMO: "bg-[var(--color-muted)]",
  AMC: "bg-[var(--color-muted)]",
};

/**
 * A row of toggleable pill buttons for one filter dimension. Multi-select
 * within a group (OR), ANDed against the other group — "RICH or CHEAP,
 * reporting BULLISH" rather than forcing one verdict at a time.
 *
 * Shared between the month calendar and the past-earnings table — both filter
 * the same two axes (verdict, direction) over an already-loaded, small
 * dataset, so this is one client-side toggle-and-filter pattern, not two.
 */
export function FilterGroup({
  label,
  options,
  active,
  dotClass,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  active: Set<string>;
  dotClass: Record<string, string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="eyebrow text-[var(--color-muted)]">{label}</span>
      <div className="flex items-center gap-1">
        {options.map((opt) => {
          const isActive = active.has(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              aria-pressed={isActive}
              className={`pressable text-2xs flex items-center gap-1 rounded-[var(--radius-chip)] border px-1.5 py-0.5 font-mono font-medium tracking-[0.06em] uppercase transition-colors ${
                isActive
                  ? "border-[var(--color-heading)]/20 bg-[var(--color-panel-soft)] text-[var(--color-heading)]"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-panel-soft)]"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass[opt]}`}
                aria-hidden
              />
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * From/to date-range filter, sharing the same eyebrow-label + control row
 * shape every other filter in this app uses. Native `<input type="date">`
 * rather than a custom picker: it's a triage table filter, not a form
 * someone lingers on, and every browser already has a perfectly good date
 * picker built in.
 */
export function DateRangeFilter({
  label,
  from,
  to,
  onFromChange,
  onToChange,
}: {
  label: string;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  const inputClass =
    "text-2xs w-32 shrink-0 sm:w-[8.5rem] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 text-[var(--color-heading)] focus:border-[var(--color-brand)] focus:outline-none";

  return (
    <div className="flex flex-wrap items-center gap-1.5 gap-y-2">
      <span className="eyebrow shrink-0 text-[var(--color-muted)]">{label}</span>
      <input
        type="date"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        aria-label={`${label} from`}
        className={inputClass}
      />
      <span className="text-2xs shrink-0 text-[var(--color-muted)]">to</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        aria-label={`${label} to`}
        className={inputClass}
      />
    </div>
  );
}

/** Hairline separator between filter groups in a toolbar row — depth from a
 * border, not a gap alone, matching Vertical's "no shadows" rule. Hidden
 * below `sm` since flex-wrap is more likely to break a row there, and a
 * divider stranded at the start of a wrapped line reads as a stray mark. */
export function FilterDivider() {
  return (
    <div className="hidden h-4 w-px shrink-0 bg-[var(--color-border)] sm:block" aria-hidden />
  );
}

export function toggleInSet(set: Set<string>, setSet: (s: Set<string>) => void, value: string) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setSet(next);
}
