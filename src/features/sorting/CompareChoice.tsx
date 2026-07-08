"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import { itemDisplayName, itemInitial } from "@/lib/items";
import { Button, CardImage } from "@/components/ui";
import posthog from "posthog-js";
import { enqueue, newClientKey, readQueue, type QueueKey } from "./decisionQueue";
import { awaitAck, isInFlight, triggerFlush, type AckOutcome } from "./decisionFlusher";

type Result = "item_a" | "item_b" | "tie" | "skip";

export type CompareSubmit =
  | { kind: "session"; sessionId: string; curatorId: string; collectionId?: string }
  | { kind: "local"; onDecision: (result: Result) => void };

// The compare surface does NOT wait out the flusher's 60 s backoff cap: after
// this bound it shows the gentle retry state while the queue keeps the entry —
// a later ack recovers silently (spec §3.3).
export const COMPARE_ACK_BOUND_MS = 5_000;
// TONE register — person-side, never "error"/"failed" (TONE-review item).
export const COMPARE_SLOW_SAVE_LINE = "Still saving that one — it's safe, and it's on its way.";
// The storage-unavailable fallback's stumble (today's copy — F18 degradation).
const FALLBACK_RETRY_LINE = "That didn't save. Try again.";

interface CompareChoiceProps {
  submit: CompareSubmit;
  itemA: Item;
  itemB: Item;
  heroA?: string;
  heroB?: string;
  /** Gentle, non-pressuring progress: how many comparisons made so far. */
  comparisonsMade: number;
}

export function CompareChoice({ submit, itemA, itemB, heroA, heroB, comparisonsMade }: CompareChoiceProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Idempotency key per in-flight decision, keyed by the choice ("a"/"b"/"tie"/
  // "skip"). Generated ONCE when a tap starts and reused if that same tap is
  // retried — the queue entry IS the retry, so a timed-out-then-re-tapped save
  // dedupes server-side instead of inserting a duplicate comparison. Cleared on
  // ack so a subsequent tap on the same card gets a fresh key.
  //
  // Keying by choice slot (not by pair) is safe ONLY because a not-yet-acked
  // tap does not router.refresh() — the pair never advances before the ack, so
  // a given slot key can only ever recur as the same-comparison retry, never as
  // a new pair reusing a stale key. Ack clears the key AND refreshes together.
  const clientKeys = useRef<Record<string, string>>({});
  // A late ack (after the bound) and a re-tap's ack can both land for one
  // clientKey — settle exactly once per decision.
  const settled = useRef(new Set<string>());

  function settle(clientKey: string, slot: string, result: Result, outcome: AckOutcome) {
    if (submit.kind !== "session" || settled.current.has(clientKey)) return;
    settled.current.add(clientKey);
    delete clientKeys.current[slot];
    if (outcome.status !== "rejected") {
      posthog.capture("pairwise_decision_made", {
        result,
        session_id: submit.sessionId,
        item_a_id: itemA.id,
        item_b_id: itemB.id,
        comparisons_made: comparisonsMade + 1,
      });
    }
    // A rejected ack still advances — the piece is no longer in the collection,
    // and the notice slot (PendingNotices) explains; this component stays quiet.
    setError(null);
    // Clear pending BEFORE refresh: router.refresh() re-renders THIS same
    // client instance with the next pair, so a still-set `pending` would
    // soft-lock the next pair (all controls disabled, a card stuck "Saving…").
    setPending(null);
    router.refresh();
  }

  async function choose(result: Result, slot: string) {
    if (submit.kind === "local") {
      submit.onDecision(result); // demo path: no clientKeys, no pending, no posthog, no refresh
      return;
    }

    setPending(slot);
    setError(null);
    const key: QueueKey = {
      curatorId: submit.curatorId,
      sessionId: submit.sessionId,
      collectionId: submit.collectionId,
    };
    const clientKey = (clientKeys.current[slot] ??= newClientKey());

    // NEVER a bare fetch (spec §3.3/F11): the decision rides the queue and the
    // single-flight flusher as a batch-of-1, so it cannot interleave with a
    // draining triage queue. A re-tap of the same slot finds its entry already
    // queued/in flight and simply re-awaits the same ack.
    const alreadyRiding = readQueue(key).some((e) => e.clientKey === clientKey) || isInFlight(key, clientKey);
    if (!alreadyRiding && !settled.current.has(clientKey)) {
      const persisted = await enqueue(
        key,
        {
          kind: "decision",
          clientKey,
          type: "pairwise_compare",
          decision: { itemAId: itemA.id, itemBId: itemB.id, result },
          enqueuedAt: new Date().toISOString(),
        },
        () => triggerFlush(key), // quota → shrink the queue, retry once (F18)
      );
      if (persisted === "needs_fallback") {
        // Storage unavailable even after the flush: degrade to today's awaited
        // single-route submit and advance on ITS ack (F18).
        let landed = false;
        try {
          const res = await fetch(`/api/sessions/${submit.sessionId}/decisions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "pairwise_compare",
              decision: { itemAId: itemA.id, itemBId: itemB.id, result },
              clientKey,
            }),
          });
          landed = res.ok;
        } catch {
          landed = false;
        }
        if (!landed) {
          setError(FALLBACK_RETRY_LINE);
          setPending(null);
          return; // the pair stays; re-tapping retries with the SAME clientKey
        }
        settle(clientKey, slot, result, { status: "created" }); // the awaited submit IS the ack
        return;
      }
    }

    const ack = awaitAck(key, clientKey);
    void triggerFlush(key);
    const outcome = await Promise.race([
      ack,
      new Promise<"slow">((resolve) => {
        setTimeout(() => resolve("slow"), COMPARE_ACK_BOUND_MS);
      }),
    ]);
    if (outcome === "slow") {
      // Gentle retry state: the queue keeps the entry and keeps retrying on the
      // pinned backoff; a later ack recovers silently (advances then).
      setPending(null);
      setError(COMPARE_SLOW_SAVE_LINE);
      void ack.then((late) => settle(clientKey, slot, result, late));
      return;
    }
    settle(clientKey, slot, result, outcome);
  }

  const busy = pending !== null;
  const choices = [
    { item: itemA, hero: heroA, result: "item_a" as const, key: "a" },
    { item: itemB, hero: heroB, result: "item_b" as const, key: "b" },
  ];

  return (
    <div className="space-y-6">
      {/* Tapping a card IS the choice (tap-first). Always two-up: a comparison. */}
      <div className="grid grid-cols-2 gap-4">
        {choices.map(({ item, hero, result, key }) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            aria-label={`Choose ${itemDisplayName(item)}`}
            onClick={() => choose(result, key)}
            className="group flex min-h-11 flex-col overflow-hidden rounded-card border border-hairline bg-surface text-left transition-shadow duration-200 ease-gentle hover:shadow-lift focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-content-soft">
              <CardImage
                src={hero}
                alt={itemDisplayName(item)}
                fallback={
                  <span className="font-display text-6xl text-ink-soft" aria-hidden>
                    {itemInitial(item)}
                  </span>
                }
              />
            </div>
            <div className="p-4">
              <h3 className="text-ink">{pending === key ? "Saving…" : itemDisplayName(item)}</h3>
              {item.brand && <p className="mt-1 text-sm text-ink-soft">{item.brand}</p>}
            </div>
          </button>
        ))}
      </div>

      {/* Escape hatches, deliberately quiet. */}
      <div className="flex items-center justify-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={busy} onClick={() => choose("tie", "tie")}>
          {pending === "tie" ? "Saving…" : "Tie"}
        </Button>
        <span className="text-hairline" aria-hidden>
          &middot;
        </span>
        <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={busy} onClick={() => choose("skip", "skip")}>
          {pending === "skip" ? "Saving…" : "Skip"}
        </Button>
      </div>

      {comparisonsMade > 0 && (
        <p className="text-center text-sm text-ink-soft">
          {comparisonsMade} {comparisonsMade === 1 ? "comparison" : "comparisons"} made so far
        </p>
      )}
      {error && <p className="text-center text-sm text-ink-soft">{error}</p>}
    </div>
  );
}
