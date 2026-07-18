"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";

const TITLE_ID = "sort-help-title";

export function SortHelpDialog() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
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
  }, [open]);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label="How sorting works"
        className="w-full sm:w-auto"
      >
        <span className="sm:hidden">Sort help</span>
        <span className="hidden sm:inline">How sorting works</span>
      </Button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
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
              tabIndex={-1}
              className="relative z-10 w-full max-w-lg rounded-card border border-hairline bg-surface-raised p-5 text-left shadow-raised outline-hidden"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id={TITLE_ID} className="font-display text-2xl text-ink">
                    How sorting works
                  </h2>
                  <p className="mt-2 text-sm text-ink-soft">
                    Use one, two, or all three. Each sort stacks on the others.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close sort help"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-xl text-ink-soft hover:bg-content-soft hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span aria-hidden>×</span>
                </button>
              </div>

              <dl className="mt-5 space-y-4">
                <div>
                  <dt className="font-semibold text-ink">Triage</dt>
                  <dd className="mt-1 text-sm text-ink-soft">Groups how you feel about each piece.</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Usage</dt>
                  <dd className="mt-1 text-sm text-ink-soft">
                    Adds whether it is in your life right now.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Compare</dt>
                  <dd className="mt-1 text-sm text-ink-soft">Puts pieces in order by what you&apos;d reach for first.</dd>
                </div>
              </dl>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
