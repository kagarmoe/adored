"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useOptionalTriageUndo } from "./TriageUndoProvider";

// The triage "Not mine" affordance: a single quiet tap records that this item
// isn't the person's to decide (a `set_aside` disposition) via the provider,
// which then refreshes so the next item comes forward. No confirm step — this
// is a gentle, reversible escape (the persistent "Bring back" notice lives in
// TriageUndoNotice, hoisted outside the empty-state branch).
//
// Rendered UN-KEYED in the triage page so this instance survives
// router.refresh(): keeping the same DOM node means focus stays on the button
// after the next item arrives, rather than dropping to <body>. Focus is NOT
// auto-moved anywhere on tap — yanking focus could read as pressure (tap-first
// charter); we only ensure it isn't lost.
// `submit` selects the wiring without changing the affordance:
//  - "session" — TODAY's path: records the set-aside disposition via the mounted
//    TriageUndoProvider (which supplies collectionId) and refreshes the queue.
//  - "local" — the /welcome walkthrough: synchronous, no network, no provider;
//    a tap just advances the demo via onDecision().
export function SetAsideButton({
  submit,
  itemId,
  itemName,
}: {
  submit: { kind: "session" } | { kind: "local"; onDecision: () => void };
  itemId: string;
  itemName: string | null;
}) {
  // Non-throwing read: local mode renders with no provider mounted. Session mode
  // still requires one — asserted below, same message as the old hook.
  const ctx = useOptionalTriageUndo();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (submit.kind === "local") {
      submit.onDecision();
      return;
    }
    if (!ctx) throw new Error("useTriageUndo must be used within a TriageUndoProvider");
    if (busy) return; // the provider also guards in-flight; this is the visual gate
    setBusy(true);
    try {
      await ctx.setAside(itemId, itemName);
    } finally {
      setBusy(false);
    }
  }

  const busyInSession = submit.kind === "session" && busy;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      disabled={busyInSession}
      title="set aside — not mine to decide"
      aria-label="Not mine — set aside, not mine to decide"
    >
      {busyInSession ? "Just a moment…" : "Not mine"}
    </Button>
  );
}
