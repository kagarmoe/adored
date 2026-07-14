"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import { itemDisplayName, itemInitial } from "@/lib/items";
import { Button, CardImage } from "@/components/ui";
import { enqueue, newClientKey, readQueue, type QueueKey } from "./decisionQueue";
import { awaitAck, isInFlight, triggerFlush } from "./decisionFlusher";

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
  // Mounted (empty) on first render so the region exists BEFORE its text ever
  // changes — a live region that appears with its content is not announced.
  const [announcement, setAnnouncement] = useState("");
  // A late ack (after the bound) and a re-tap's ack can both land for one
  // clientKey — settle exactly once per decision.
  const settled = useRef(new Set<string>());

  function settle(clientKey: string, slot: string, result: Result) {
    if (submit.kind !== "session" || settled.current.has(clientKey)) return;
    settled.current.add(clientKey);
    delete clientKeys.current[slot];
    // A rejected ack still advances — the piece is no longer in the collection,
    // and the notice slot (PendingNotices) explains; this component stays quiet.
    setError(null);
    // The pair advances silently under a screen-reader user otherwise (SC 4.1.3).
    // Naming both pieces is load-bearing, not decoration: a live region does not
    // re-announce identical text, and the pair always changes.
    const a = itemDisplayName(itemA);
    const b = itemDisplayName(itemB);
    setAnnouncement(
      result === "tie"
        ? `${a} and ${b} — loved just the same.`
        : result === "skip"
          ? `${a} and ${b} — set aside for now.`
          : `You love ${result === "item_a" ? a : b} more than ${result === "item_a" ? b : a}.`,
    );
    // Clear pending BEFORE refresh: router.refresh() re-renders THIS same
    // client instance with the next pair, so a still-set `pending` would
    // soft-lock the next pair (all controls disabled, a card stuck "Saving…").
    setPending(null);
    router.refresh();
  }

  async function choose(result: Result, slot: string) {
    if (submit.kind === "local") {
      submit.onDecision(result); // demo path: no clientKeys, no pending, no refresh
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
        settle(clientKey, slot, result); // the awaited submit IS the ack
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
      void ack.then(() => settle(clientKey, slot, result));
      return;
    }
    settle(clientKey, slot, result);
  }

  const busy = pending !== null;
  const choices = [
    { item: itemA, hero: heroA, result: "item_a" as const, key: "a" },
    { item: itemB, hero: heroB, result: "item_b" as const, key: "b" },
  ];

  return (
    <div className="space-y-6">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {/* Tapping a card IS the choice (tap-first). Always two-up: a comparison. */}
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        {choices.map(({ item, hero, result, key }) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            aria-label={`Choose ${itemDisplayName(item)}`}
            onClick={() => choose(result, key)}
            className="group flex min-h-11 flex-col overflow-hidden rounded-card border border-hairline bg-surface text-left transition-shadow duration-200 ease-gentle hover:shadow-lift focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="relative flex aspect-4/3 items-center justify-center overflow-hidden bg-content-soft">
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
