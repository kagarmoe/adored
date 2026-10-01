"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, OverflowMenu, type OverflowMenuItem } from "@/components/ui";

export const IN_RANKING_LINE = "This one is part of a saved ranking.";

interface ItemOverflowMenuProps {
  itemId: string;
  /** The collection's items-list path; archive lands here with ?removed=<id>. */
  itemsHref: string;
  /** Owner-only: purge and remove-from-sorts are `items:purge` server-side. */
  isOwner: boolean;
}

type Step = null | "confirm" | "in-ranking" | "finished-ranking";

// Archive = the reversible soft delete; the undo waits on the items list
// (RemovedItemNotice). Delete = the owner-only permanent purge. The server
// answers 409 while any sort result holds the item: drafts can be cleared via
// remove-from-sorts, after which Delete is offered again; a finished (finalized)
// ranking is a hard block, so archive is the way out there.
export function ItemOverflowMenu({ itemId, itemsHref, isOwner }: ItemOverflowMenuProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (step) keepRef.current?.focus();
  }, [step]);

  // Returns the response, or null after showing the retry line. `busy` disables every
  // trigger (menu items + panel buttons), so a second request can't start mid-flight.
  async function send(request: () => Promise<Response>): Promise<Response | null> {
    setBusy(true);
    setError("");
    const res = await request().catch(() => null);
    setBusy(false);
    if (!res || (!res.ok && res.status !== 409)) {
      setError("That didn’t go through — give it another try in a moment.");
      return null;
    }
    return res;
  }

  async function archive() {
    const res = await send(() => fetch(`/api/items/${itemId}`, { method: "DELETE" }));
    if (res?.ok) router.push(`${itemsHref}?removed=${itemId}`);
  }

  async function purge() {
    const res = await send(() =>
      fetch(`/api/items/${itemId}/purge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "PURGE" }),
      }),
    );
    if (!res) return;
    if (res.ok) router.push(itemsHref);
    else setStep("in-ranking");
  }

  async function clearRankings() {
    const res = await send(() =>
      fetch(`/api/items/${itemId}/remove-from-sorts`, { method: "POST" }),
    );
    if (!res?.ok) return;
    const { remainingInFinalized } = (await res.json()) as { remainingInFinalized: number };
    setStep(remainingInFinalized > 0 ? "finished-ranking" : "confirm");
  }

  function close() {
    setStep(null);
    setError("");
  }

  const items: OverflowMenuItem[] = [{ label: "Archive", onSelect: archive, disabled: busy }];
  if (isOwner) {
    items.push({
      label: "Delete",
      tone: "danger",
      onSelect: () => setStep("confirm"),
      disabled: busy,
    });
  }

  return (
    <div className="relative shrink-0">
      <OverflowMenu label="More actions" items={items} />
      <div className="absolute right-0 z-30 mt-2 w-72 space-y-2">
        {step && (
          <div
            role="group"
            aria-label="Delete this item"
            onKeyDown={(e) => e.key === "Escape" && close()}
            className="space-y-3 rounded-card bg-surface-raised p-4 shadow-raised ring-1 ring-hairline"
          >
            {step === "confirm" && (
              <p className="text-sm text-ink">
                Delete this item for good? Its photos go with it, and this can’t be undone.
              </p>
            )}
            {step === "in-ranking" && (
              <p className="text-sm text-ink">
                {IN_RANKING_LINE} Take it out of your saved rankings first, or archive it instead.
              </p>
            )}
            {step === "finished-ranking" && (
              <p className="text-sm text-ink">
                It’s also part of a finished ranking, so it stays there. Archiving keeps it out of
                your way.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button ref={keepRef} variant="secondary" disabled={busy} onClick={close}>
                Keep
              </Button>
              {step === "confirm" && (
                <Button variant="danger" disabled={busy} onClick={purge}>
                  {busy ? "Deleting…" : "Delete for good"}
                </Button>
              )}
              {step === "in-ranking" && (
                <Button variant="secondary" disabled={busy} onClick={clearRankings}>
                  Remove from saved rankings
                </Button>
              )}
            </div>
          </div>
        )}
        {/* Always mounted so the live region exists before the message arrives. */}
        <p role="status" className="text-right text-sm text-error-deep">
          {error}
        </p>
      </div>
    </div>
  );
}
