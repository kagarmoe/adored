"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

export interface MoveTarget {
  id: string;
  number: number | null;
  name: string | null;
}

export type MoveDestination =
  | { type: "item"; itemId: string }
  | { type: "new" }
  | { type: "pool" };

/** Label for a move target, mirroring itemDisplayName's fallback: name, else #N. */
export function targetLabel(target: MoveTarget): string {
  const name = target.name?.trim();
  if (name) return name;
  return target.number != null ? `#${target.number}` : "Untitled";
}

export function PhotoMoveBar({
  count,
  busy,
  targets,
  onMove,
  onClear,
}: {
  count: number;
  busy: boolean;
  targets: MoveTarget[];
  onMove: (dest: MoveDestination) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  // While the chooser is open, Escape dismisses it (tap-first, but keyboard-safe).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (count === 0) return null;

  const choose = (dest: MoveDestination) => {
    setOpen(false);
    onMove(dest);
  };

  return (
    <>
      {open && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 cursor-default bg-transparent"
        />
      )}
      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-rim bg-glass-strong px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 backdrop-blur-sm"
        role="region"
        aria-label="Move photos"
      >
        <div className="mx-auto max-w-3xl">
          {open && (
            <div className="relative z-20 mb-3 max-h-64 overflow-y-auto rounded-control border border-hairline bg-surface-raised shadow-lg">
              <ul className="divide-y divide-hairline">
                <li>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => choose({ type: "new" })}
                    className="flex min-h-11 w-full items-center px-4 py-2 text-left text-ink hover:bg-content-soft disabled:opacity-50"
                  >
                    New item
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => choose({ type: "pool" })}
                    className="flex min-h-11 w-full items-center px-4 py-2 text-left text-ink hover:bg-content-soft disabled:opacity-50"
                  >
                    Back to the pool
                  </button>
                </li>
                {targets.map((target) => (
                  <li key={target.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => choose({ type: "item", itemId: target.id })}
                      className="flex min-h-11 w-full items-center px-4 py-2 text-left text-ink hover:bg-content-soft disabled:opacity-50"
                    >
                      {targetLabel(target)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-soft" aria-live="polite">
              {count} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  onClear();
                }}
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="primary"
                className="min-h-11"
                disabled={busy}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                {busy ? "Moving…" : "Move to…"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
