"use client";

export const VERDICTS = ["RICH", "CHEAP", "FAIR"] as const;
export const DIRECTIONS = ["BULLISH", "BEARISH", "NEUTRAL"] as const;

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

export function toggleInSet(set: Set<string>, setSet: (s: Set<string>) => void, value: string) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setSet(next);
}
