"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface ItemDeleteControlProps {
  itemId: string;
  /** The collection's items-list path; success navigates here with ?removed=<id>. */
  itemsHref: string;
}

// Remove-this-item control for the details page. Two-step (reveal → confirm) so a
// stray tap can't drop an item; the DELETE is a soft delete, and success lands on
// the items list where RemovedItemNotice offers the undo (spec: 2026-07-23 rev 2).
// Deliberate clone of PhotoDeleteControl's state machine, not a shared hook — a
// one-consumer hook is premature; revisit at a fourth copy.
export function ItemDeleteControl({ itemId, itemsHref }: ItemDeleteControlProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  async function remove() {
    if (inFlight.current) return; // a double-tap before `busy` renders is a no-op
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("remove failed");
      // No router.refresh(): the items route is dynamic (session+DB), so the
      // push to a new URL already renders it fresh — proven by the e2e.
      router.push(`${itemsHref}?removed=${itemId}`);
    } catch {
      setError("That didn’t go through — the item is still here; try again.");
      setBusy(false);
      inFlight.current = false;
    }
  }

  if (!confirming) {
    return (
      <div className="mt-6 border-t border-hairline pt-4">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex h-11 items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path
              d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Remove from collection
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Remove this item"
      className="mt-6 flex flex-col gap-2 rounded-card border-t border-hairline bg-surface p-3 pt-4 shadow-lift ring-1 ring-hairline"
    >
      <span className="text-sm text-ink">Remove this item from the collection?</span>
      <span className="text-sm text-ink-soft">
        Its photos and story go with it. You can bring it back right after, if you change
        your mind.
      </span>
      <div className="flex gap-2">
        {/* Default size (h-11): the confirm pair are the destructive moment's
            primary tap targets — DESIGN.md's 44px floor applies hardest here. */}
        <Button
          ref={cancelRef}
          variant="secondary"
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
          disabled={busy}
        >
          Keep
        </Button>
        <Button variant="danger" onClick={remove} disabled={busy}>
          {busy ? "Removing…" : "Remove"}
        </Button>
      </div>
      {error && (
        <span role="status" className="text-sm text-error-deep">
          {error}
        </span>
      )}
    </div>
  );
}
