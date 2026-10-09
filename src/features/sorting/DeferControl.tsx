"use client";

import { Button } from "@/components/ui";

// The triage "Not yet" affordance: a single quiet tap sets the current item
// aside for later (a `deferred` disposition). No confirm step — defer is
// reversible and low-stakes, so a two-step gate would add friction to a gentle
// escape (TONE.md, commitment 4).
//
// `onDecision` is the caller's Not yet (the round's own queue entry, or the
// walkthrough's demo step).
const LABEL = "Not yet";
const TITLE = "Keeps it for later";
const ARIA_LABEL = "Not yet — keeps it for later";

export function DeferControl({ onDecision }: { onDecision: () => void }) {
  return (
    <Button type="button" variant="ghost" title={TITLE} aria-label={ARIA_LABEL} onClick={onDecision}>
      {LABEL}
    </Button>
  );
}
