"use client";

import { Button } from "@/components/ui";

// The triage "Not mine" affordance: a single quiet tap calls `onDecision` (the
// round's Not mine, which sets it aside through the provider, or the
// walkthrough's demo step). No confirm step — this is a gentle, reversible
// escape (the persistent "Bring back" notice lives in TriageUndoNotice,
// hoisted outside the empty-state branch).
//
// Rendered UN-KEYED in the triage page so this instance survives the optimistic
// advance to the next piece: keeping the same DOM node means focus stays on the
// button after the next item arrives, rather than dropping to <body>. Focus is
// NOT auto-moved anywhere on tap — yanking focus could read as pressure
// (tap-first charter); we only ensure it isn't lost.
export function SetAsideButton({ onDecision }: { onDecision: () => void }) {
  return (
    <Button type="button" variant="ghost" onClick={onDecision} title="Sets it aside" aria-label="Not mine — sets it aside">
      Not mine
    </Button>
  );
}
