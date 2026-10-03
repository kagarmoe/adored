"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { MAX_GROUP_PHOTOS, POOL_CAP_MESSAGE } from "@/lib/pool-limits";

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
function targetLabel(target: MoveTarget): string {
  const name = target.name?.trim();
  if (name) return name;
  return target.number != null ? `#${target.number}` : "Untitled";
}

export function PoolActionBar({
  count,
  busy,
  targets,
  onMakeItem,
  onMakeEach,
  onMove,
  onClear,
}: {
  count: number;
  busy: boolean;
  targets: MoveTarget[];
  onMakeItem: () => void;
  onMakeEach?: () => void;
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

  const overCap = count > MAX_GROUP_PHOTOS;

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
      {/* The PR 3 bottom-bar surface (ActionBar): glass-strong + blur + lift + hairline edge,
          z-30 under the z-40 header. Fixed at every width (a selection follows the person
          through a long grid); static on a short viewport. No mb-0: it is the last child of
          PoolPhotoGrid's space-y-4, which gets no margin. No safe-area padding: the root viewport
          is not viewportFit "cover", so the inset is always 0. globals.css reserves its
          height via data-selection-bar. */}
      <div
        data-selection-bar
        className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-glass-strong px-4 py-3 shadow-lift backdrop-blur-md [@media(max-height:500px)]:static"
        role="region"
        aria-label="Grouping actions"
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

          {/* The phone bar is already dense (count row + button grid + safe-area);
              the Cover pill itself carries the cue on phones, so this hint only
              earns its line at sm:+. */}
          <p className="hidden pb-2 text-xs text-ink-soft sm:block">
            The first photo you tapped becomes the cover.
          </p>

          {overCap && (
            <p className="mb-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-deep" role="alert">
              {POOL_CAP_MESSAGE}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-ink-soft" aria-live="polite">
              {count} selected
            </span>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button type="button" variant="ghost" className="min-h-11 w-full sm:w-auto" disabled={busy} onClick={onClear}>
                Clear
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 w-full sm:w-auto"
                disabled={busy || overCap}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
              >
                Move to…
              </Button>
              {/* With one photo this is identical to "Group into an item" — only
                  offer it when there's a real choice to make (2+). */}
              {count >= 2 && onMakeEach && (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 w-full sm:w-auto"
                  aria-label="Each photo its own item"
                  disabled={busy || overCap}
                  onClick={onMakeEach}
                >
                  <span className="sm:hidden">One each</span>
                  <span className="hidden sm:inline">Make each its own</span>
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                className="min-h-11 w-full sm:w-auto"
                disabled={busy || overCap}
                aria-label={busy ? "Making" : "Group into an item"}
                onClick={onMakeItem}
              >
                {busy ? (
                  "Making…"
                ) : (
                  <>
                    <span className="sm:hidden">One item</span>
                    <span className="hidden sm:inline">Group into an item</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
