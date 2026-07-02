"use client";

import { useRouter } from "next/navigation";
import { AsyncActionButton } from "./AsyncActionButton";

// The triage "Not yet" affordance: a single quiet tap sets the current item
// aside for later (a `deferred` disposition) and refreshes so the next item
// comes forward. No confirm step — defer is reversible and low-stakes, so a
// two-step gate would add friction to a gentle escape (TONE.md, commitment 4).
//
// collectionId MUST be the ULID collection.id, not the slug: the dispositions
// API authorizes the item then asserts item.collectionId === params.id, which
// is always a ULID — a slug there 404s.
export function DeferControl({
  collectionId,
  itemId,
}: {
  collectionId: string;
  itemId: string;
}) {
  const router = useRouter();

  return (
    <AsyncActionButton
      label="Not yet"
      title="I'll come back to this"
      ariaLabel="Not yet — I'll come back to this"
      action={async () => {
        const res = await fetch(`/api/collections/${collectionId}/dispositions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, disposition: "deferred" }),
        });
        if (!res.ok) throw new Error("defer failed");
        router.refresh(); // brings the next item forward; this one resurfaces later
      }}
    />
  );
}
