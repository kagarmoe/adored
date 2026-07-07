"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, Card } from "@/components/ui";
import type { VoiceSuggestionRow } from "@/lib/voice-extract-merge";

// A soft, decorative highlight (not a state hue) for a field voice just filled. It is
// always paired with the non-color marker below, so the change never reads by hue alone.
export const VOICE_APPLIED_FIELD_CLASS = "rounded-control ring-2 ring-decor";

export function VoiceAppliedMarker() {
  return <p className="mt-1 text-xs text-ink-soft">from what you said</p>;
}

// Wrap a field control so an applied field carries both the soft ring and the marker.
export function VoiceApplied({
  applied,
  children,
}: {
  applied: boolean;
  children: ReactNode;
}) {
  return (
    <div className={applied ? VOICE_APPLIED_FIELD_CLASS : undefined}>
      {children}
      {applied && <VoiceAppliedMarker />}
    </div>
  );
}

const HEADING = "Here's what I noted";
const APPLY = "Add these";
const DISMISS = "Not now";

interface VoiceReviewPanelProps {
  transcript: string;
  rows: VoiceSuggestionRow[];
  /** Called with the rows currently toggled on. */
  onApply: (selected: VoiceSuggestionRow[]) => void;
  onDismiss: () => void;
}

// The quiet review surface: the transcript, then every captured value as a toggle row
// (empty-target rows on, replace/notes rows per their defaults), revealed all at once —
// never chip-by-chip. Focus moves here on open so the whole set is read together; the
// live-region announcements are owned by the shared VoiceCapture region in the form.
export function VoiceReviewPanel({
  transcript,
  rows,
  onApply,
  onDismiss,
}: VoiceReviewPanelProps) {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.defaultOn])),
  );

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const toggle = (id: string) =>
    setOn((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <Card
      ref={panelRef}
      tabIndex={-1}
      role="group"
      aria-labelledby={headingId}
      padding="lg"
      className="space-y-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="space-y-1">
        <h2 id={headingId} className="text-base font-medium text-ink">
          {HEADING}
        </h2>
        <p className="text-sm text-ink-soft">&ldquo;{transcript}&rdquo;</p>
      </div>

      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={Boolean(on[row.id])}
                onChange={() => toggle(row.id)}
                className="h-5 w-5 shrink-0 rounded border-hairline text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <span className="text-sm text-ink">
                {row.kind === "field" ? (
                  <>
                    {row.label} &mdash; {row.value}
                    {row.current !== null && (
                      <span className="text-ink-soft">
                        {" "}
                        replaces &ldquo;{row.current}&rdquo;
                      </span>
                    )}
                  </>
                ) : (
                  <>Add to notes: {row.label}</>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex gap-3">
        <Button type="button" onClick={() => onApply(rows.filter((r) => on[r.id]))}>
          {APPLY}
        </Button>
        <Button type="button" variant="secondary" onClick={onDismiss}>
          {DISMISS}
        </Button>
      </div>
    </Card>
  );
}
