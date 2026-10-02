"use client";

import { useRouter } from "next/navigation";
import { AsyncActionButton } from "./AsyncActionButton";

// The "Set aside" list's per-row reversal: a single quiet tap brings an item back
// from set-aside (deletes its `set_aside` disposition) and refreshes so the row
// leaves the list. The DELETE is idempotent (route returns 200 either way), so a
// double-tap is harmless — the in-flight guard still collapses it to one request.
// A gentle, non-alarming error notice on failure; no confirm step — bringing back
// is reversible and low-stakes (TONE.md, commitment 4).
//
// collectionId MUST be the ULID collection.id, not the slug: the dispositions API
// authorizes the item then asserts item.collectionId === params.id, which is
// always a ULID — a slug there 404s.
export function BringBackControl({
  collectionId,
  itemId,
  itemName,
  focusAfterLastId,
}: {
  collectionId: string;
  itemId: string;
  itemName: string;
  /** Where focus goes when this was the last row (its list leaves with it). */
  focusAfterLastId?: string;
}) {
  const router = useRouter();

  return (
    <AsyncActionButton
      label="Bring back"
      ariaLabel={`Bring back ${itemName}`}
      action={async () => {
        // Read before the await: the row (and its button) leaves with the refresh.
        const row = document.activeElement?.closest("li");
        const res = await fetch(`/api/collections/${collectionId}/dispositions/${itemId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("bring back failed");
        const neighbour = row?.nextElementSibling ?? row?.previousElementSibling;
        const target = neighbour?.querySelector("button") ?? (focusAfterLastId ? document.getElementById(focusAfterLastId) : null);
        target?.focus();
        router.refresh(); // the row leaves the list; the item returns to the queue
      }}
    />
  );
}
