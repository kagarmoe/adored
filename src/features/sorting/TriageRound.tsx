"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import type { MovedDecision } from "@/lib/what-moved";
import { getRoundBox } from "@/lib/round-preference";
import { Button, Card } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { DecisionControls } from "./DecisionControls";
import { triageDecisions, type TriageResult } from "./roundCopy";
import { DeferControl } from "./DeferControl";
import { SetAsideButton } from "./SetAsideButton";
import { useOptionalTriageUndo } from "./TriageUndoProvider";
import { RoundShell } from "./RoundShell";
import { RoundTimer } from "./RoundTimer";
import { WhatMoved } from "./WhatMoved";
import { enqueue, newClientKey, removeQueued, type QueueKey } from "./decisionQueue";
import { awaitAck, isInFlight, triggerFlush, useDecisionFlusher, type AckOutcome } from "./decisionFlusher";
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

const MINUTE_MS = 60_000;
// TONE register — a gentle stumble, never "error"/"failed" (matches the
// provider's existing line).
const STUMBLE_LINE = "That didn't go through — give it another try in a moment.";

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
  const key = useMemo<QueueKey>(
    () => ({ curatorId, sessionId, collectionId }),
    [curatorId, sessionId, collectionId],
  );
  useDecisionFlusher(key); // 5-pending / 4 s / pagehide triggers — the only wiring here

  // Round-local snapshot: mid-round prop updates (e.g. a legacy affordance's
  // refresh) never perturb the round or double-count the seed (F20).
  const seedRef = useRef(decidedSeed);
  const serverLogRef = useRef(decisions);
  const initialQueueEmpty = useRef(queue.length === 0);
  const [entries, setEntries] = useState<TriageRoundQueueEntry[]>(queue);
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const [newlyDecided, setNewlyDecided] = useState<ReadonlySet<string>>(new Set());
  // This round's tap log — pending, in-flight AND already-acked entries alike,
  // so the recap can never undercount what the person actually moved (F5). It
  // doubles as the revisit history: the tail is what "Back" re-presents.
  const roundLogRef = useRef<
    Array<{ clientKey: string; itemId: string; label: string; moved: MovedDecision }>
  >([]);
  // Ack outcomes recorded as they land, so "Back" can tell a standing answer
  // (created/duplicate) from a rejected one (no-op) without racing the drain.
  const outcomesRef = useRef(new Map<string, AckOutcome>());
  // Undo-as-revisit (F19): non-null while an in-flight/acked answer is being
  // re-presented with its standing choice selected.
  const [revisit, setRevisit] = useState<{ itemId: string; clientKey: string; label: string } | null>(
    null,
  );

  // The round's clock is client-owned and fixed at mount (RoundSurface's pattern).
  const startedAtRef = useRef(Date.now());
  const [boxMs, setBoxMs] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [frozen, setFrozen] = useState<{ decisions: MovedDecision[]; endedAtMs: number } | null>(null);
  const [stumble, setStumble] = useState(false);
  const busyRef = useRef(false);
  const endSequenceRan = useRef(false);
  const undoCtx = useOptionalTriageUndo();

  useEffect(() => {
    const box = getRoundBox();
    setBoxMs(box === "none" ? null : box * MINUTE_MS);
  }, []);

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
    if (!expired) {
      endSequenceRan.current = false;
      setFrozen(null);
    }
  }, [undoNow, handled, expired]);

  const current = entries.find((e) => !handled.has(e.item.id));
  const ended = expired || current === undefined;
  // While revisiting, the standing item is shown instead of the queue head; the
  // round itself hasn't moved (walking away resumes exactly where it was).
  const revisitEntry = revisit === null ? undefined : entries.find((e) => e.item.id === revisit.itemId);
  const shown = revisitEntry ?? current;

  useEffect(() => {
    if (!ended || endSequenceRan.current) return;
    endSequenceRan.current = true;
    // Frozen recap (F5): computed ONCE at round end — the pre-round server log
    // (window-filtered away by whatMoved) merged with this round's client tap
    // log. The round-end flush and refresh proceed BEHIND it; post-refresh data
    // never re-renders it (prevents the double-count window).
    setFrozen({
      decisions: [...serverLogRef.current, ...roundLogRef.current.map((e) => e.moved)],
      endedAtMs: Date.now(),
    });
    // A round that never was (mounted onto an empty queue) has nothing to flush
    // and must not refresh — that would loop the empty mount.
    if (initialQueueEmpty.current) return;
    void (async () => {
      try {
        await triggerFlush(key); // drain settles (ack or terminal per taxonomy)…
      } finally {
        router.refresh(); // …then exactly ONE refresh (F15)
      }
    })();
  }, [ended, key, router]);

  function advancePast(itemId: string) {
    setHandled((prev) => new Set(prev).add(itemId));
  }

  async function handleTriage(target: Item, decision: { itemId: string; result: TriageResult }) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      setStumble(false);
      const clientKey = newClientKey();
      const enqueuedAt = new Date().toISOString();
      const persisted = await enqueue(
        key,
        { kind: "decision", clientKey, type: "triage", decision, enqueuedAt },
        () => triggerFlush(key), // quota → shrink the queue, retry once (F18)
      );
      if (persisted === "needs_fallback") {
        // Storage unavailable even after the flush: degrade to today's awaited
        // single-route submit and advance on ITS ack (F18).
        let landed = false;
        try {
          const res = await fetch(`/api/sessions/${sessionId}/decisions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "triage", decision, clientKey }),
          });
          landed = res.ok;
        } catch {
          landed = false;
        }
        if (!landed) {
          setStumble(true);
          return; // the item stays; the person simply tries again
        }
        outcomesRef.current.set(clientKey, { status: "created" }); // the awaited submit IS the ack
      } else {
        void awaitAck(key, clientKey).then((o) => outcomesRef.current.set(clientKey, o));
      }
      const label =
        triageDecisions(target.id).find((t) => t.decision.result === decision.result)?.label ??
        decision.result;
      roundLogRef.current.push({
        clientKey,
        itemId: target.id,
        label,
        moved: { type: "triage", createdAt: Date.parse(enqueuedAt), decision },
      });
      setNewlyDecided((prev) => new Set(prev).add(target.id)); // idempotent — a re-answer never double-counts
      advancePast(target.id);
      setRevisit(null); // a superseding answer resumes the round
    } finally {
      busyRef.current = false;
    }
  }

  // The round's back affordance: re-present the last answered item (spec §3.3).
  // Still queued → pure client undo. In-flight/acked → the answer STANDS and is
  // shown as the standing choice (F19). Rejected → nothing stands; no-op (F9 —
  // resurfacing is the reconciliation).
  function goBack() {
    if (revisit !== null) return;
    const last = roundLogRef.current[roundLogRef.current.length - 1];
    if (last === undefined) return;
    const outcome = outcomesRef.current.get(last.clientKey);
    if (outcome?.status === "rejected") return;
    if (outcome === undefined && !isInFlight(key, last.clientKey) && removeQueued(key, last.clientKey)) {
      // The answer never left the device: remove it, re-present fresh (F20 decrement).
      roundLogRef.current.pop();
      setNewlyDecided((prev) => {
        const next = new Set(prev);
        next.delete(last.itemId);
        return next;
      });
      setHandled((prev) => {
        const next = new Set(prev);
        next.delete(last.itemId);
        return next;
      });
      return;
    }
    setRevisit({ itemId: last.itemId, clientKey: last.clientKey, label: last.label });
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

  const timer = (
    <RoundTimer
      startedAtMs={startedAtRef.current}
      boxMs={boxMs}
      onExpire={() => setExpired(true)}
      roundLabel="This round"
    />
  );

  return (
    <RoundShell
      step={1}
      totalSteps={3}
      roundLabel="This round"
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
          decisions={frozen?.decisions ?? [...serverLogRef.current, ...roundLogRef.current.map((e) => e.moved)]}
          windowStartMs={startedAtRef.current}
          nowMs={frozen?.endedAtMs}
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
            {revisit === null && roundLogRef.current.length > 0 && (
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

          {stumble && (
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
                  <Button type="button" variant="ghost" onClick={() => setRevisit(null)}>
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
