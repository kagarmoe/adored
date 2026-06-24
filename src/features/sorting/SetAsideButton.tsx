"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { useTriageUndo } from "./TriageUndoProvider";

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
export function SetAsideButton({
  itemId,
  itemName,
}: {
  itemId: string;
  itemName: string | null;
}) {
  const { setAside } = useTriageUndo();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return; // the provider also guards in-flight; this is the visual gate
    setBusy(true);
    try {
      await setAside(itemId, itemName);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      disabled={busy}
      title="set aside — not mine to decide"
      aria-label="Not mine — set aside, not mine to decide"
    >
      {busy ? "Just a moment…" : "Not mine"}
    </Button>
  );
}
