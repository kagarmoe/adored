"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

// The triage "Not yet" affordance: a single quiet tap sets the current item
// aside for later (a `deferred` disposition) and refreshes so the next item
// comes forward. No confirm step — defer is reversible and low-stakes, so a
// two-step gate would add friction to a gentle escape (TONE.md, commitment 4).
// In-flight guard mirrors ActiveSessionPanel so a double-tap sends one POST.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function defer() {
    if (inFlight.current) return; // a double-tap before `busy` renders is a no-op
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/collections/${collectionId}/dispositions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, disposition: "deferred" }),
      });
      if (!res.ok) throw new Error("defer failed");
      router.refresh(); // brings the next item forward; this one resurfaces later
    } catch {
      setError("That didn't go through — give it another try in a moment.");
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="ghost"
        onClick={defer}
        disabled={busy}
        title="I'll come back to this"
        aria-label="Not yet — I'll come back to this"
      >
        {busy ? "Just a moment…" : "Not yet"}
      </Button>
      {error && (
        <span role="status" className="text-sm text-ink-soft">
          {error}
        </span>
      )}
    </div>
  );
}
