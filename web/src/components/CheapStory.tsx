import Link from "next/link";

import { cheapStory } from "@/lib/insights";
import type { TrackRecordPage } from "@/lib/types";

/**
 * The track record's most useful finding, as a callout rather than a sentence
 * buried in a paragraph: RICH calls are common and win small; CHEAP calls are
 * rare and pay. Renders nothing until both sides have a priced average.
 */
export function CheapStoryCallout({
  record,
  showLink = true,
}: {
  record: TrackRecordPage;
  showLink?: boolean;
}) {
  const story = cheapStory(record);
  if (!story) return null;
  return (
    <aside
      className="rounded-[var(--radius-panel)] border border-[var(--color-verdict-cheap)]/30 px-5 py-4"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--color-verdict-cheap) 9%, var(--color-panel)) 0%, var(--color-panel) 70%)",
      }}
    >
      <p className="font-mono text-[11px] font-semibold tracking-[0.12em] text-[var(--color-verdict-cheap)] uppercase">
        What the record shows
      </p>
      <p className="mt-1.5 text-lg font-semibold text-[var(--color-heading)]">
        {story.headline}
      </p>
      <p className="mt-1.5 max-w-4xl text-[var(--color-body)]">{story.body}</p>
      {(story.caveat || showLink) && (
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {story.caveat}
          {story.caveat && showLink && " "}
          {showLink && (
            <Link href="/track-record/" className="text-[var(--color-brand)] hover:underline">
              Full track record →
            </Link>
          )}
        </p>
      )}
    </aside>
  );
}
