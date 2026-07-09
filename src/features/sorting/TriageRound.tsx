"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import type { MovedDecision } from "@/lib/what-moved";
import { Button, Card } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { DecisionControls } from "./DecisionControls";
import { triageDecisions, THIS_ROUND_LABEL, type TriageResult } from "./roundCopy";
import { DeferControl } from "./DeferControl";
import { SetAsideButton } from "./SetAsideButton";
import { useOptionalTriageUndo } from "./TriageUndoProvider";
import { RoundShell } from "./RoundShell";
import { RoundTimer } from "./RoundTimer";
import { RoundLengthChooser } from "./RoundLengthChooser";
import { WhatMoved } from "./WhatMoved";
import { enqueue, newClientKey } from "./decisionQueue";
import { triggerFlush } from "./decisionFlusher";
import { STUMBLE_LINE, useOptimisticRound } from "./useOptimisticRound";
import { PendingNotices } from "./pendingNotices";

export interface TriageRoundQueueEntry {
  item: Item;
  deferred: boolean;
  heroPhotoUrl?: string;
}

interface TriageRoundProps {
  curatorId: string;
  sessionId: string;
  /** ULID collection.id — the queue key + disposition endpoint (never the slug). */
  collectionId: string;
  /** collection.slug ?? collection.id — ItemCard's link base. */
  collectionSlugOrId: string;
  /** Server-selected whole eligible remainder (selectTriageQueue), in round order. */
  queue: TriageRoundQueueEntry[];
  /** Server decision log for the recap merge (pre-round; the window filter excludes it). */
  decisions: MovedDecision[];
  /** Server-computed distinct-decided count (today's `preferences.length`). */
  decidedSeed: number;
  hubHref: string;
  setAsideHref: string;
}

/**
 * The optimistic triage round (spec §3.3): advances through the server-selected
 * queue from LOCAL state, enqueueing each decision into the localStorage queue —
 * the UI advances only after the entry is persisted (persist-before-advance),
 * and `router.refresh()` fires exactly ONCE, at round end, after the final
 * drain settles (F15). No mid-round refetch: the queue/seed/decision-log props
 * are snapshotted at mount, so a stray refresh can never desync the round.
 */
export function TriageRound({
  curatorId,
  sessionId,
  collectionId,
  collectionSlugOrId,
  queue,
  decisions,
  decidedSeed,
  hubHref,
  setAsideHref,
}: TriageRoundProps) {
  const router = useRouter();

  // Round-local snapshot: mid-round prop updates (e.g. a legacy affordance's
  // refresh) never double-count the seed (F20).
  const seedRef = useRef(decidedSeed);
  const [entries, setEntries] = useState<TriageRoundQueueEntry[]>(queue);
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const [newlyDecided, setNewlyDecided] = useState<ReadonlySet<string>>(new Set());
  const undoCtx = useOptionalTriageUndo();

  // The queue fork is triage's own: the head not yet handled. Everything else
  // about advancing that decision optimistically (flusher wiring, enqueue +
  // quota fallback, the tap log + frozen recap + one-refresh end sequence, the
  // undo-as-revisit machine, the round clock) rides the shared hook.
  const current = entries.find((e) => !handled.has(e.item.id));
  const round = useOptimisticRound<{ itemId: string; result: TriageResult }>({
    curatorId,
    sessionId,
    collectionId,
    decisionType: "triage",
    serverLog: decisions,
    initialQueueEmpty: queue.length === 0,
    queueExhausted: current === undefined,
    fallbackBody: (decision, clientKey) => ({ type: "triage", decision, clientKey }),
    labelFor: (itemId, decision) =>
      triageDecisions(itemId).find((t) => t.decision.result === decision.result)?.label ??
      decision.result,
    toMoved: (decision, createdAtMs) => ({ type: "triage", createdAt: createdAtMs, decision }),
  });
  const { key, revisit, expired, reopenRound } = round;

  // Bring-back restore (Epic C's §11 promise, kept under Epic P): when the
  // provider's undo clears via "Bring back", the item returns to THIS round's
  // focus — pure client un-advance, no refresh (the clear rides the queue).
  // A queue-exhausted round un-ends (the recap recedes — the escape must
  // never be a dead end); a TIMER-expired round stays ended: the time box is
  // the boundary, and the item simply returns next round.
  const lastUndoRef = useRef(undoCtx?.undo ?? null);
  const undoNow = undoCtx?.undo ?? null;
  useEffect(() => {
    const prev = lastUndoRef.current;
    lastUndoRef.current = undoNow;
    if (prev === null || undoNow !== null) return;
    if (!handled.has(prev.itemId)) return; // not this round's advance — nothing to restore
    setHandled((handledPrev) => {
      const next = new Set(handledPrev);
      next.delete(prev.itemId);
      return next;
    });
    if (!expired) reopenRound();
  }, [undoNow, handled, expired, reopenRound]);

  // While revisiting, the standing item is shown instead of the queue head; the
  // round itself hasn't moved (walking away resumes exactly where it was).
  const revisitEntry = revisit === null ? undefined : entries.find((e) => e.item.id === revisit.itemId);
  const shown = revisitEntry ?? current;

  function advancePast(itemId: string) {
    setHandled((prev) => new Set(prev).add(itemId));
  }

  async function handleTriage(target: Item, decision: { itemId: string; result: TriageResult }) {
    if (!(await round.submitDecision(target.id, decision))) return;
    setNewlyDecided((prev) => new Set(prev).add(target.id)); // idempotent — a re-answer never double-counts
    advancePast(target.id);
  }

  // The round's back affordance (spec §3.3): the shared machine decides queued
  // vs standing vs no-op. A queued undo comes back here to un-advance the item
  // and decrement this round's count (F20) — the two pieces of triage state the
  // hook never owns.
  function goBack() {
    const fresh = round.goBack();
    if (fresh === null) return;
    setNewlyDecided((prev) => {
      const next = new Set(prev);
      next.delete(fresh.itemId);
      return next;
    });
    setHandled((prev) => {
      const next = new Set(prev);
      next.delete(fresh.itemId);
      return next;
    });
  }

  async function handleDefer(target: Item) {
    // Dispositions ride the queue (never a bare fetch), so they can never
    // overtake queued decisions; the flusher sends them alone between runs.
    const clientKey = newClientKey();
    const persisted = await enqueue(
      key,
      {
        kind: "disposition",
        clientKey,
        itemId: target.id,
        disposition: "deferred",
        enqueuedAt: new Date().toISOString(),
      },
      () => triggerFlush(key),
    );
    if (persisted === "needs_fallback") {
      // Storage unavailable: degrade to today's awaited direct submit (F18).
      try {
        await fetch(`/api/collections/${collectionId}/dispositions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: target.id, disposition: "deferred" }),
        });
      } catch {
        // best-effort: the item still rests at the tail and resurfaces next round
      }
    }
    // Round-local resurface: the item moves to the tail as deferred.
    setEntries((prev) => {
      const found = prev.find((e) => e.item.id === target.id);
      if (!found) return prev;
      return [...prev.filter((e) => e.item.id !== target.id), { ...found, deferred: true }];
    });
  }

  function handleSetAside(target: Item) {
    // The provider owns the network + the "Bring back" undo state; the round
    // owns the optimistic advance — the tap never waits.
    if (undoCtx) void undoCtx.setAside(target.id, target.name);
    advancePast(target.id);
  }

  // Ceiling-free cue (F20): seed + this round's tap set. Ticks on the tap,
  // never on the flush; dispositions don't count.
  const decided = seedRef.current + newlyDecided.size;

  const roundOver = shown === undefined || expired;
  const timer = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <RoundTimer
          startedAtMs={round.startedAtMs}
          boxMs={round.boxMs}
          onExpire={round.onExpire}
          roundLabel={THIS_ROUND_LABEL}
        />
      </div>
      {/* Switchable before AND during a round (parent D2); shown only while the
          round is live — the recap has no length to choose. */}
      {!roundOver && <RoundLengthChooser onChange={round.onBoxChange} />}
    </div>
  );

  return (
    <RoundShell
      step={1}
      totalSteps={4}
      roundLabel={THIS_ROUND_LABEL}
      timer={timer}
      onPause={() => router.push(hubHref)}
    >
      {/* The flush engine's one quiet voice — OUTSIDE the content swap so a
          notice raised mid-round is still on screen when the recap (and the
          round-end revert) lands (F9). */}
      <div className="mx-auto max-w-xl">
        <PendingNotices />
      </div>
      {shown === undefined || expired ? (
        <WhatMoved
          decisions={round.recapDecisions}
          windowStartMs={round.windowStartMs}
          nowMs={round.recapNowMs}
          hubHref={hubHref}
        />
      ) : (
        <div className="mx-auto max-w-xl space-y-6">
          <div>
            <h1 className="text-3xl text-ink">How do you feel about this one?</h1>
            {decided > 0 && (
              <p className="mt-2 text-sm text-ink-soft">{decided} decided so far</p>
            )}
            {/* A quiet way back to the ones set aside — count-free, low-emphasis, and
                well below the decision so it never competes with it (TONE.md 4). */}
            <p className="mt-1 text-sm">
              <Link
                href={setAsideHref}
                className="text-ink-soft underline underline-offset-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary rounded-sm"
              >
                Set aside
              </Link>
            </p>
            {/* Undo-as-revisit: a quiet single step back, never a rewind. */}
            {round.canGoBack && (
              <p className="mt-1">
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex h-11 items-center gap-1 rounded-control text-sm text-ink-soft transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
                >
                  <span aria-hidden>←</span> Back
                </button>
              </p>
            )}
          </div>

          {round.stumble && (
            <p role="status" className="text-sm text-ink-soft">
              {STUMBLE_LINE}
            </p>
          )}

          {shown.deferred && (
            <div className="flex items-center gap-2 rounded-control bg-content-mid px-4 py-3 text-ink transition-opacity duration-300 ease-gentle motion-reduce:transition-none">
              <span aria-hidden className="text-lg leading-none">☾</span>
              <p className="text-sm">
                <span className="font-medium">Ready when you are.</span>{" "}
                This one was waiting for you — no rush.
              </p>
            </div>
          )}

          <ItemCard
            item={shown.item}
            collectionId={collectionSlugOrId}
            heroPhotoUrl={shown.heroPhotoUrl}
            imageClassName="h-64"
          />
          <Card padding="lg">
            <div className="space-y-4">
              {revisit !== null && (
                <p className="text-sm text-ink-soft">
                  You placed this with {revisit.label} — change it?
                </p>
              )}
              <DecisionControls
                key={shown.item.id}
                submit={{ kind: "local", onDecision: (d) => void handleTriage(shown.item, d) }}
                type="triage"
                decisions={triageDecisions(shown.item.id)}
                priorAnswer={revisit?.label}
              />
              {revisit === null ? (
                /* Quiet, demoted escapes below a hairline — both advance
                   optimistically through the round's own handlers. */
                <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-hairline pt-3">
                  <DeferControl
                    submit={{ kind: "local", onDecision: () => void handleDefer(shown.item) }}
                    itemId={shown.item.id}
                  />
                  <SetAsideButton
                    submit={{ kind: "local", onDecision: () => handleSetAside(shown.item) }}
                    itemId={shown.item.id}
                    itemName={shown.item.name}
                  />
                </div>
              ) : (
                /* A flushed answer can't be superseded by a disposition (disposed ⇔
                   untriaged), so "Not yet"/"Not mine" step back while revisiting —
                   only a gentle way to resume remains. */
                <div className="border-t border-hairline pt-3">
                  <Button type="button" variant="ghost" onClick={round.clearRevisit}>
                    Keep going
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </RoundShell>
  );
}
