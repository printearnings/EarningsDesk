"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "printearnings:theme";

/**
 * Light/dark toggle. A simple two-state switch, not a three-way
 * system/light/dark picker — clicking it always sets an explicit choice
 * (persisted, and applied before paint on the next load by the inline script
 * in the root layout). Following the OS automatically is still the default
 * for anyone who never touches this button; pure CSS handles that case, no
 * JS involved.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Same documented exception Sidebar's collapse-state read relies on:
    // reading an external system (localStorage, the DOM attribute the inline
    // script may have already set, matchMedia) once on mount, since none of
    // it exists during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(currentTheme());
    setHydrated(true);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`pressable flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel-soft)] hover:text-[var(--color-heading)] ${hydrated ? "" : "invisible"}`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/** Explicit choice (data-theme, set either by the inline init script or a
 * prior toggle in this session) wins; otherwise fall back to the same system
 * signal the CSS itself reacts to. */
function currentTheme(): "light" | "dark" {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function SunIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth={1.3} />
      <path
        d="M8 1.5v1.4M8 13.1v1.4M14.5 8h-1.4M2.9 8H1.5M12.6 3.4l-1 1M4.4 11.6l-1 1M12.6 12.6l-1-1M4.4 4.4l-1-1"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13.5 9.7A5.6 5.6 0 1 1 6.3 2.5a4.4 4.4 0 0 0 7.2 7.2Z"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinejoin="round"
      />
    </svg>
  );
}
