"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, OverflowMenu, type OverflowMenuItem } from "@/components/ui";
import { confirmLeave } from "./useLeaveGuard";

export const IN_RANKING_LINE = "This one is part of a saved ranking.";

interface ItemOverflowMenuProps {
  itemId: string;
  /** The collection home — its items grid; archive lands here with ?removed=<id>. */
  listHref: string;
  /** Owner-only: purge and remove-from-sorts are `items:purge` server-side. */
  isOwner: boolean;
}

type Step = null | "confirm" | "in-ranking" | "finished-ranking";

// Archive = the reversible soft delete; the undo waits on the collection home
// (ArchivedNotice). Delete = the owner-only permanent purge. The server
// answers 409 while any sort result holds the item: drafts can be cleared via
// remove-from-sorts, after which Delete is offered again; a finished (finalized)
// ranking is a hard block, so archive is the way out there.
export function ItemOverflowMenu({ itemId, listHref, isOwner }: ItemOverflowMenuProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keepRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const messageId = useId();

  useEffect(() => {
    if (step) keepRef.current?.focus();
  }, [step]);

  // Returns the response, or null after showing the retry line. `busy` disables every
  // trigger (menu items + panel buttons), so a second request can't start mid-flight.
  // Only purge treats 409 as an answer (in a ranking); everywhere else it's a failure.
  async function send(
    request: () => Promise<Response>,
    { conflictIsAnswer = false } = {},
  ): Promise<Response | null> {
    setBusy(true);
    setError("");
    const res = await request().catch(() => null);
    setBusy(false);
    if (!res || (!res.ok && !(conflictIsAnswer && res.status === 409))) {
      setError("That didn’t go through — give it another try in a moment.");
      return null;
    }
    return res;
  }

  async function archive() {
    if (!confirmLeave()) return;
    const res = await send(() => fetch(`/api/items/${itemId}`, { method: "DELETE" }));
    if (res?.ok) router.push(`${listHref}?removed=${itemId}`);
  }

  async function purge() {
    const res = await send(
      () =>
        fetch(`/api/items/${itemId}/purge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: "PURGE" }),
        }),
      { conflictIsAnswer: true },
    );
    if (!res) return;
    if (res.ok) router.push(listHref);
    else setStep("in-ranking");
  }

  async function clearRankings() {
    const res = await send(() =>
      fetch(`/api/items/${itemId}/remove-from-sorts`, { method: "POST" }),
    );
    if (!res) return;
    const body = (await res.json().catch(() => null)) as { remainingInFinalized?: unknown } | null;
    if (typeof body?.remainingInFinalized !== "number") {
      setError("That didn’t go through — give it another try in a moment.");
      return;
    }
    setStep(body.remainingInFinalized > 0 ? "finished-ranking" : "confirm");
  }

  // The panel's buttons unmount on close, so hand focus back to the ··· trigger.
  function close() {
    setStep(null);
    setError("");
    wrapperRef.current?.querySelector<HTMLElement>('button[aria-haspopup="menu"]')?.focus();
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
    // `contents`: the trigger, the confirm, and the status line are all items of the page's
    // wrapping header row, so the confirm and status line take full-width rows in flow.
    <div ref={wrapperRef} className="contents">
      <div className="shrink-0">
        <OverflowMenu label="More actions" items={items} />
      </div>
      {/* In flow as a full-width row under the header, like the status line, so it
          never covers the subtitle or the photo. */}
      {step && (
        <div
          role="group"
          aria-label="Delete this item"
          aria-describedby={messageId}
          onKeyDown={(e) => e.key === "Escape" && close()}
          className="mt-3 basis-full space-y-3 rounded-card bg-surface-raised p-4 shadow-lift ring-1 ring-hairline"
        >
          {step === "confirm" && (
            <p id={messageId} className="text-sm text-ink">
              Delete this item for good? Its photos go with it, and this can’t be undone.
            </p>
          )}
          {step === "in-ranking" && (
            <p id={messageId} className="text-sm text-ink">
              {IN_RANKING_LINE} Take it out of saved rankings first, or archive it instead.
            </p>
          )}
          {step === "finished-ranking" && (
            <p id={messageId} className="text-sm text-ink">
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
      {/* Always mounted so the live region exists before the message arrives. In flow
          (a full-width row under the title), never floating, so it can't cover the
          photo controls or the form; it gets a surface only while it has something to say. */}
      <p
        role="status"
        className={`basis-full text-sm ${
          error
            ? "mt-3 rounded-card bg-surface-raised p-3 text-error-deep ring-1 ring-hairline"
            : ""
        }`}
      >
        {error}
      </p>
    </div>
  );
}
