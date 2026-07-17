"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import type { RoundBoxSeconds } from "@/lib/round-preference";
import { TimerDial } from "./TimerDial";

const TITLE_ID = "round-length-title";

interface RoundLengthDialogProps {
  open: boolean;
  initial: RoundBoxSeconds;
  /** Fires ONCE, on Done — expiry ends a round, so a finger passing through
   *  low values while dragging must never end it mid-preview. */
  onCommit: (box: RoundBoxSeconds) => void;
  /** Esc / scrim / × — cancel, never commits. */
  onClose: () => void;
}

/**
 * The mid-round length dialog (Task 6): a touch-set dial that previews freely
 * and commits only on Done. Follows SortHelpDialog's portal/scrim/focus-trap/
 * Escape contract verbatim; the trigger (RoundTimer's ring button) lives in
 * the host and regains focus natively when this portal unmounts.
 */
export function RoundLengthDialog({ open, initial, onCommit, onClose }: RoundLengthDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<RoundBoxSeconds>(initial);
  // Tracks the `open` value the draft was last seeded against — an
  // adjust-during-render reset (React's documented alternative to a
  // setState-in-effect), so a stale preview from a prior open (cancelled, or
  // a different round) never leaks into the next one.
  const [seededForOpen, setSeededForOpen] = useState(open);
  if (open !== seededForOpen) {
    setSeededForOpen(open);
    if (open) setDraft(initial);
  }

  useEffect(() => {
    if (!open) return;
    const slider = panelRef.current?.querySelector<HTMLElement>('[role="slider"]');
    slider?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleDone() {
    onCommit(draft);
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="relative z-10 w-full rounded-t-card border border-hairline bg-surface-raised p-5 shadow-raised outline-hidden sm:max-w-sm sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={TITLE_ID} className="font-display text-2xl text-ink">
            Round length
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close round length"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-xl text-ink-soft hover:bg-content-soft hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span aria-hidden>×</span>
          </button>
        </div>

        <div className="mt-4 flex justify-center">
          <TimerDial value={draft} onChange={setDraft} />
        </div>

        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={handleDone}>
            Done
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
