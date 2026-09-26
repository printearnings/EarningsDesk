"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A metric label that reveals a plain-English definition on click/tap — the
 * "what does P/E even mean" affordance for readers meeting these terms for the
 * first time. Click-to-toggle (not hover) so it works identically on a phone
 * and a desktop; a dotted underline marks the label as explainable.
 *
 * Rendered as a client island inside otherwise-static grids (FundamentalsGrid),
 * so only the labels that carry a definition become interactive.
 */
export function InfoTip({
  label,
  description,
  className = "",
}: {
  label: string;
  description: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="cursor-help text-left decoration-dotted underline-offset-2 hover:underline focus:outline-none focus-visible:underline"
      >
        {label}
      </button>
      {open && (
        // Opens below the label so the first row of a grid can't push it above
        // the panel. Origin-aware scale/opacity entrance, matching the app's
        // other popovers.
        <span
          role="tooltip"
          className="absolute top-full left-0 z-30 mt-1.5 w-56 origin-top rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 font-sans text-xs leading-snug font-normal tracking-normal text-[var(--color-body)] normal-case opacity-100 transition-[opacity,transform] duration-[var(--duration-fast)] ease-[var(--ease-out)] starting:scale-95 starting:opacity-0"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {description}
        </span>
      )}
    </span>
  );
}
