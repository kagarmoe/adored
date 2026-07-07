"use client";

import { Button } from "@/components/ui";
import { useOptionalTriageUndo } from "./TriageUndoProvider";

// The triage "Not yet" affordance: a single quiet tap sets the current item
// aside for later (a `deferred` disposition). No confirm step — defer is
// reversible and low-stakes, so a two-step gate would add friction to a gentle
// escape (TONE.md, commitment 4).
//
// `submit` selects how a defer commits:
//   - session: the live app path — the tap enqueues a `deferred` disposition
//     through the TriageUndoProvider's queue seam (Epic P, spec §3.3): no fetch,
//     no refresh on the tap path; the flusher delivers it and the item rests at
//     the tail. Requires a mounted TriageUndoProvider (which owns collectionId).
//   - local: the /welcome walkthrough — no queue, no network; call onDecision()
//     synchronously. The button stays enabled and keeps its "Not yet" label
//     across taps.
type DeferControlProps = {
  submit: { kind: "session" } | { kind: "local"; onDecision: () => void };
  itemId: string;
};

const LABEL = "Not yet";
const TITLE = "I'll come back to this";
const ARIA_LABEL = "Not yet — I'll come back to this";

export function DeferControl({ submit, itemId }: DeferControlProps) {
  // Non-throwing read: local mode renders with no provider mounted. Session
  // mode still requires one — asserted below, same message as the hook's.
  const ctx = useOptionalTriageUndo();

  if (submit.kind === "local") {
    return (
      <Button
        type="button"
        variant="ghost"
        title={TITLE}
        aria-label={ARIA_LABEL}
        onClick={() => submit.onDecision()}
      >
        {LABEL}
      </Button>
    );
  }

  if (!ctx) throw new Error("useTriageUndo must be used within a TriageUndoProvider");

  return (
    <Button
      type="button"
      variant="ghost"
      title={TITLE}
      aria-label={ARIA_LABEL}
      onClick={() => void ctx.defer(itemId)}
    >
      {LABEL}
    </Button>
  );
}
