"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const CATEGORIES = [
  { value: "feedback", label: "Feedback" },
  { value: "bug", label: "Report an issue / bug" },
] as const;

const fieldClass =
  "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-heading)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-brand)] focus:outline-none";

// Public by design — a Turnstile site key is meant to ship in the page, the
// same way a reCAPTCHA site key does. The matching secret key never leaves
// the Worker; it's what actually verifies the token server-side.
const TURNSTILE_SITE_KEY = "0x4AAAAAAERcM3UxAJgZphiK";

declare global {
  interface Window {
    turnstile?: {
      render(
        container: HTMLElement,
        options: { sitekey: string; callback: (token: string) => void; theme?: string },
      ): string;
      reset(widgetId?: string): void;
      remove(widgetId?: string): void;
    };
  }
}

/**
 * Posts straight to the Worker's /api/support route — no mailto: link, no
 * address rendered anywhere in this component. The real inbox lives only in
 * the Worker's `send_email` binding config, so nothing in the page source or
 * network tab ever names it; this form is the only thing a visitor can see.
 *
 * Turnstile guards it against scripted spam: rate limiting alone only caps
 * volume from one source, it doesn't stop a bot from hitting this endpoint
 * directly with curl (CORS/content-type checks are enforced by browsers, not
 * by a script choosing its own headers).
 */
export function SupportForm() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("feedback");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    if (!scriptLoaded || !turnstileRef.current || !window.turnstile) return;
    widgetId.current = window.turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token) => setTurnstileToken(token),
      theme: "auto",
    });
    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
    };
  }, [scriptLoaded]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!turnstileToken) {
      setState({
        status: "error",
        message: "Verification still loading, try again in a moment.",
      });
      return;
    }
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          subject,
          description,
          page: window.location.href,
          turnstileToken,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ status: "error", message: body.error ?? `Request failed (${res.status}).` });
        // A token is single-use regardless of outcome — get a fresh one for the retry.
        if (widgetId.current) window.turnstile?.reset(widgetId.current);
        setTurnstileToken("");
        return;
      }
      setState({ status: "done" });
    } catch {
      setState({
        status: "error",
        message: "Couldn't send that right now. Try again shortly.",
      });
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      setTurnstileToken("");
    }
  }

  if (state.status === "done") {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-sm font-medium text-[var(--color-heading)]">Thanks, we got it.</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          We read every submission, though not every one gets a reply.
        </p>
        <button
          type="button"
          onClick={() => {
            setSubject("");
            setDescription("");
            setState({ status: "idle" });
          }}
          className="pressable text-2xs mt-4 text-[var(--color-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-body)]"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <form onSubmit={submit} className="space-y-4 px-5 py-5">
        <div>
          <label
            htmlFor="support-category"
            className="eyebrow mb-1.5 block text-[var(--color-muted)]"
          >
            Type
          </label>
          <select
            id="support-category"
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as (typeof CATEGORIES)[number]["value"])
            }
            className={fieldClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="support-subject"
            className="eyebrow mb-1.5 block text-[var(--color-muted)]"
          >
            Subject
          </label>
          <input
            id="support-subject"
            type="text"
            required
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={category === "bug" ? "What went wrong" : "What's on your mind"}
            className={fieldClass}
          />
        </div>

        <div>
          <label
            htmlFor="support-description"
            className="eyebrow mb-1.5 block text-[var(--color-muted)]"
          >
            Description
          </label>
          <textarea
            id="support-description"
            required
            maxLength={5000}
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              category === "bug"
                ? "What you expected, what happened instead, and the ticker/page if relevant"
                : "Tell us what you think"
            }
            className={`${fieldClass} resize-y`}
          />
        </div>

        <div ref={turnstileRef} />

        {state.status === "error" && (
          <p className="text-sm text-[var(--color-warning)]">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={state.status === "loading"}
          className="pressable rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel-soft)] px-4 py-2 text-sm font-medium text-[var(--color-heading)] transition-colors hover:bg-[var(--color-border)] disabled:opacity-50"
        >
          {state.status === "loading" ? "Sending…" : "Send"}
        </button>
      </form>
    </>
  );
}
