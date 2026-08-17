/**
 * The PrintEarnings mark: a rounded navy square with three ascending bars —
 * a small, literal nod to "earnings" (a chart, growing) that doesn't compete
 * with the serif/mono wordmark typography sitting next to it everywhere it
 * appears. `currentColor`-free and token-driven, so it flips correctly with
 * the brand color in dark mode without a separate dark asset.
 */
export function LogoMark({
  size = 28,
  onBrand = false,
  className = "",
}: {
  size?: number;
  /** Inverts the fill (white chip, navy bars) for use on --color-band or
   * --color-brand itself — a navy-filled mark would disappear there. */
  onBrand?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        width="28"
        height="28"
        rx="7"
        fill={onBrand ? "var(--color-on-brand)" : "var(--color-brand)"}
      />
      <path
        d="M8.5 18.5V14.5M14 18.5V9.5M19.5 18.5V12"
        stroke={onBrand ? "var(--color-brand)" : "var(--color-on-brand)"}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "Print" in ink/on-brand, "Earnings" muted — the split reads as a
 * lockup, not two separate words, at every size this is used at. */
export function Wordmark({
  className = "",
  onBrand = false,
}: {
  className?: string;
  onBrand?: boolean;
}) {
  return (
    <span className={`font-mono tracking-[0.08em] uppercase ${className}`}>
      <span
        className={onBrand ? "text-[var(--color-on-brand)]" : "text-[var(--color-heading)]"}
      >
        Print
      </span>
      <span
        className={onBrand ? "text-[var(--color-on-brand-muted)]" : "text-[var(--color-muted)]"}
      >
        Earnings
      </span>
    </span>
  );
}

const SIZES = {
  sm: { mark: 22, gap: "gap-1.5", text: "text-xs" },
  md: { mark: 28, gap: "gap-2", text: "text-sm" },
  lg: { mark: 40, gap: "gap-3", text: "text-xl" },
} as const;

/** Mark + wordmark together — the standard lockup for anywhere the brand
 * needs to actually introduce itself (the landing hero, in particular). The
 * collapsed sidebar rail uses LogoMark alone instead of this at a smaller
 * size, since there's no room for the wordmark there. */
export function Logo({
  size = "md",
  onBrand = false,
  className = "",
}: {
  size?: keyof typeof SIZES;
  onBrand?: boolean;
  className?: string;
}) {
  const config = SIZES[size];
  return (
    <span className={`inline-flex items-center ${config.gap} ${className}`}>
      <LogoMark size={config.mark} onBrand={onBrand} />
      <Wordmark className={`font-medium ${config.text}`} onBrand={onBrand} />
    </span>
  );
}
