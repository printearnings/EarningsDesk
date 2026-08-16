"use client";

import { useState } from "react";

const CATEGORIES = [
  { value: "feedback", label: "Feedback" },
  { value: "bug", label: "Report an issue / bug" },
] as const;

const fieldClass =
  "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-heading)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-brand)] focus:outline-none";

/**
 * Posts straight to the Worker's /api/support route — no mailto: link, no
 * address rendered anywhere in this component. The real inbox lives only in
 * the Worker's `send_email` binding config, so nothing in the page source or
 * network tab ever names it; this form is the only thing a visitor can see.
 */
export function SupportForm() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("feedback");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done" }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category,
          subject,
          description,
          email: email || undefined,
          page: window.location.href,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ status: "error", message: body.error ?? `Request failed (${res.status}).` });
        return;
      }
      setState({ status: "done" });
    } catch {
      setState({
        status: "error",
        message: "Couldn't send that right now. Try again shortly.",
      });
    }
  }

  if (state.status === "done") {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-sm font-medium text-[var(--color-heading)]">Thanks — we got it.</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {email
            ? "We'll reply to the address you gave us if it needs a response."
            : "We read every submission, though not every one gets a reply."}
        </p>
        <button
          type="button"
          onClick={() => {
            setSubject("");
            setDescription("");
            setEmail("");
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
          onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number]["value"])}
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

      <div>
        <label
          htmlFor="support-email"
          className="eyebrow mb-1.5 block text-[var(--color-muted)]"
        >
          Your email (optional)
        </label>
        <input
          id="support-email"
          type="email"
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Only if you want a reply"
          className={fieldClass}
        />
      </div>

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
  );
}
