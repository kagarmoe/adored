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

// The pairs screen does NOT wait out the flusher's 60 s backoff cap: after this
// bound it shows the gentle retry line while the queue keeps the entry.
export const COMPARE_ACK_BOUND_MS = 5_000;
export const COMPARE_SLOW_SAVE_LINE = "Still saving that one — it's safe, and it's on its way.";
const FALLBACK_RETRY_LINE = "That didn't save. Try again.";

interface Pair {
  itemA: Item;
  itemB: Item;
  heroA?: string;
  heroB?: string;
}
interface Answered extends Pair {
  result: Result;
}

/** The person's word for a pair answer, as Undo shows it (spec §4). */
export function answerLabel({ itemA, itemB, result }: Answered): string {
  if (result === "tie") return "Tie";
  if (result === "skip") return "Skip";
  return itemDisplayName(result === "item_a" ? itemA : itemB);
}

interface CompareChoiceProps extends Pair {
  submit: CompareSubmit;
  /** A one-line transition shown until the first answer lands ("Now, between these two…"). */
  intro?: string;
}

export function CompareChoice({ submit, itemA, itemB, heroA, heroB, intro }: CompareChoiceProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per in-flight tap slot, reused if that same tap is retried;
  // cleared on ack. Revisit slots are namespaced so they never reuse a pair key.
  const clientKeys = useRef<Record<string, string>>({});
  // Mounted empty so the region exists before its text changes (SC 4.1.3).
  const [announcement, setAnnouncement] = useState("");
  const settled = useRef(new Set<string>());
  // Undo (spec §4): the last settled answer, and the pair being revisited.
  const [last, setLast] = useState<Answered | null>(null);
  const [revisit, setRevisit] = useState<Answered | null>(null);
  const shown: Pair = revisit ?? { itemA, itemB, heroA, heroB };
  const mode = revisit ? "revisit" : "pair";

  function settle(clientKey: string, slot: string, answered: Answered) {
    if (submit.kind !== "session" || settled.current.has(clientKey)) return;
    settled.current.add(clientKey);
    delete clientKeys.current[slot];
    setError(null);
    const a = itemDisplayName(answered.itemA);
    const b = itemDisplayName(answered.itemB);
    setAnnouncement(
      answered.result === "tie"
        ? `${a} and ${b} — loved just the same.`
        : answered.result === "skip"
          ? `${a} and ${b} — skipped for now.`
          : `You love ${answered.result === "item_a" ? a : b} more than ${answered.result === "item_a" ? b : a}.`,
    );
    setLast(answered);
    setRevisit(null);
    // Clear pending BEFORE refresh: the refresh re-renders THIS instance with the next pair.
    setPending(null);
    router.refresh();
  }

  async function choose(result: Result, tapped: string) {
    if (submit.kind === "local") {
      submit.onDecision(result); // walkthrough: no keys, no pending, no refresh
      return;
    }
    const pair = shown;
    const slot = `${mode}:${tapped}`;
    setPending(slot);
    setError(null);
    const key: QueueKey = { curatorId: submit.curatorId, sessionId: submit.sessionId, collectionId: submit.collectionId };
    const clientKey = (clientKeys.current[slot] ??= newClientKey());
    const decision = { itemAId: pair.itemA.id, itemBId: pair.itemB.id, result };

    // NEVER a bare fetch: the answer rides the queue as a batch-of-1.
    const alreadyRiding = readQueue(key).some((e) => e.clientKey === clientKey) || isInFlight(key, clientKey);
    if (!alreadyRiding && !settled.current.has(clientKey)) {
      const persisted = await enqueue(
        key,
        { kind: "decision", clientKey, type: "pairwise_compare", decision, enqueuedAt: new Date().toISOString() },
        () => triggerFlush(key),
      );
      if (persisted === "needs_fallback") {
        let landed = false;
        try {
          const res = await fetch(`/api/sessions/${submit.sessionId}/decisions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "pairwise_compare", decision, clientKey }),
          });
          landed = res.ok;
        } catch {
          landed = false;
        }
        if (!landed) {
          setError(FALLBACK_RETRY_LINE);
          setPending(null);
          return;
        }
        settle(clientKey, slot, { ...pair, result });
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
      setPending(null);
      setError(COMPARE_SLOW_SAVE_LINE);
      void ack.then(() => settle(clientKey, slot, { ...pair, result }));
      return;
    }
    settle(clientKey, slot, { ...pair, result });
  }

  const busy = pending !== null;
  const prior = revisit?.result;
  const pressed = (result: Result) => (prior === undefined ? undefined : prior === result);
  const ring = (result: Result) => (prior === result ? " ring-2 ring-primary ring-offset-2" : "");
  const choices = [
    { item: shown.itemA, hero: shown.heroA, result: "item_a" as const, key: "a" },
    { item: shown.itemB, hero: shown.heroB, result: "item_b" as const, key: "b" },
  ];

  return (
    <div className="space-y-6">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {intro && last === null && <p className="text-ink-soft">{intro}</p>}
      {revisit && <p className="text-sm text-ink-soft">You chose {answerLabel(revisit)} — change it?</p>}

      {/* Tapping a card IS the choice (tap-first). Always two-up. */}
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        {choices.map(({ item, hero, result, key }) => (
          <button
            key={key}
            type="button"
            disabled={busy}
            aria-label={`Choose ${itemDisplayName(item)}`}
            aria-pressed={pressed(result)}
            onClick={() => choose(result, key)}
            className={`group flex min-h-11 flex-col overflow-hidden rounded-card border border-hairline bg-surface text-left transition-shadow duration-200 ease-gentle hover:shadow-lift focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60${ring(result)}`}
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
              <h3 className="text-ink">{pending === `${mode}:${key}` ? "Saving…" : itemDisplayName(item)}</h3>
              {item.brand && <p className="mt-1 text-sm text-ink-soft">{item.brand}</p>}
            </div>
          </button>
        ))}
      </div>

      {/* Escape hatches, deliberately quiet. */}
      <div className="flex items-center justify-center gap-2">
        <Button type="button" variant="ghost" size="sm" className={`min-h-11${ring("tie")}`} disabled={busy} aria-pressed={pressed("tie")} onClick={() => choose("tie", "tie")}>
          {pending === `${mode}:tie` ? "Saving…" : "Tie"}
        </Button>
        <span className="text-hairline" aria-hidden>
          &middot;
        </span>
        <Button type="button" variant="ghost" size="sm" className={`min-h-11${ring("skip")}`} disabled={busy} aria-pressed={pressed("skip")} onClick={() => choose("skip", "skip")}>
          {pending === `${mode}:skip` ? "Saving…" : "Skip"}
        </Button>
      </div>

      {submit.kind === "session" && revisit && (
        <div className="flex justify-center">
          <Button type="button" variant="ghost" onClick={() => setRevisit(null)}>
            Keep going
          </Button>
        </div>
      )}
      {submit.kind === "session" && !revisit && last && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => setRevisit(last)}
            className="inline-flex h-11 items-center rounded-control px-2 text-sm text-ink-soft transition-colors hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
          >
            Undo: {answerLabel(last)}
          </button>
        </div>
      )}
      {error && <p className="text-center text-sm text-ink-soft">{error}</p>}
    </div>
  );
}
