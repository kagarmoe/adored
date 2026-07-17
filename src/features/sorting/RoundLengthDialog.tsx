"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
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
  /** The host's trigger (RoundTimer's ring button) to refocus when this portal
   *  closes — unmounting a portal drops focus to <body>, so this dialog can't
   *  "regain focus natively"; the host must hand back the element. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * The mid-round length dialog (Task 6): a touch-set dial that previews freely
 * and commits only on Done. Follows SortHelpDialog's portal/scrim/focus-trap/
 * Escape contract verbatim; unlike SortHelpDialog (which owns its own trigger),
 * this dialog's trigger lives in the host (RoundTimer's ring button), so the
 * host hands it back via `returnFocusRef` and every close path refocuses it.
 */
export function RoundLengthDialog({ open, initial, onCommit, onClose, returnFocusRef }: RoundLengthDialogProps) {
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

  // Every close path (Esc, scrim, ×, Done) routes through here so focus always
  // returns to the host's trigger — a portal unmount alone drops focus to
  // <body>, it does not restore it (SortHelpDialog can refocus its OWN trigger
  // in its own close(); this dialog's trigger lives in the host, so the host
  // must hand it back).
  function close() {
    onClose();
    returnFocusRef?.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const slider = panelRef.current?.querySelector<HTMLElement>('[role="slider"]');
    slider?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
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
    // `close` (and the onClose/returnFocusRef it closes over) is intentionally
    // NOT a dep: this effect must only re-run when `open` flips, never on every
    // render — the host re-renders every tick (RoundTimer's countdown), and
    // re-running this effect on each of those would re-focus the slider on top
    // of whatever the person is doing inside the open dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function handleDone() {
    onCommit(draft);
    close();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden onClick={close} />
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
            onClick={close}
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
