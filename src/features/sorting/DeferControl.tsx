"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { AsyncActionButton } from "./AsyncActionButton";

// The triage "Not yet" affordance: a single quiet tap sets the current item
// aside for later (a `deferred` disposition) and refreshes so the next item
// comes forward. No confirm step — defer is reversible and low-stakes, so a
// two-step gate would add friction to a gentle escape (TONE.md, commitment 4).
//
// `submit` selects how a defer commits:
//   - session: the live app path — POST a `deferred` disposition, then refresh.
//     collectionId MUST be the ULID collection.id, not the slug: the dispositions
//     API authorizes the item then asserts item.collectionId === params.id, which
//     is always a ULID — a slug there 404s.
//   - local: the /welcome walkthrough — no fetch; call onDecision() synchronously.
//     This deliberately bypasses AsyncActionButton, whose success path never
//     resets `busy` (correct for a one-shot session submit, but a reused local
//     instance would soft-lock disabled after one tap). The local button stays
//     enabled and keeps its "Not yet" label across taps.
type DeferControlProps = {
  submit:
    | { kind: "session"; collectionId: string }
    | { kind: "local"; onDecision: () => void };
  itemId: string;
};

const LABEL = "Not yet";
const TITLE = "I'll come back to this";
const ARIA_LABEL = "Not yet — I'll come back to this";

export function DeferControl({ submit, itemId }: DeferControlProps) {
  const router = useRouter();

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

  const { collectionId } = submit;
  return (
    <AsyncActionButton
      label={LABEL}
      title={TITLE}
      ariaLabel={ARIA_LABEL}
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
