"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import { itemDisplayName, itemInitial } from "@/lib/items";
import { Button, CardImage } from "@/components/ui";
import { enqueue, newClientKey, readQueue, type PendingEntry, type QueueKey } from "./decisionQueue";
import { directSubmit } from "./directSubmit";
import { awaitAck, getNoticeSet, isInFlight, subscribeNoticeSet, triggerFlush, type AckOutcome } from "./decisionFlusher";

type Result = "item_a" | "item_b" | "tie" | "skip";

type CompareSubmit =
  | { kind: "session"; sessionId: string; curatorId: string; collectionId: string }
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
function answerLabel({ itemA, itemB, result }: Answered): string {
  if (result === "tie") return "Tie";
  if (result === "skip") return "Skip";
  return itemDisplayName(result === "item_a" ? itemA : itemB);
}

interface CompareChoiceProps extends Pair {
  submit: CompareSubmit;
}

export function CompareChoice({ submit, itemA, itemB, heroA, heroB }: CompareChoiceProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  // The tap guard. Controls stay enabled while an answer saves (aria-disabled):
  // disabling the focused card would drop focus to <body> on every answer.
  const pendingRef = useRef(false);
  // A sort closed elsewhere (409): the answer will never land here, so the
  // "it's safe" line must not stand and the controls hold still; PendingNotices
  // says what happened. Only THIS sort's conflict: a sticky one from an earlier
  // sort in the same tab (or any, for the local walkthrough) never holds this one.
  const sessionId = submit.kind === "session" ? submit.sessionId : undefined;
  const notices = useSyncExternalStore(subscribeNoticeSet, getNoticeSet, getNoticeSet);
  const closedElsewhere =
    sessionId !== undefined && notices.some((n) => n.kind === "session_conflict" && n.sessionId === sessionId);
  // Derived, not reset in an effect: both tap guards and `busy` already hold on closedElsewhere, and
  // the ack bound releases the tap guard; only the "Saving…" label must let go here.
  // Relies on a session_conflict never being dismissed in-tab (it offers Reload only).
  const saving = closedElsewhere ? null : pending;
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per in-flight tap, reused if that same tap is retried so the
  // server dedupes the retry; cleared on ack. The slot names the PAIR as well as the
  // choice: Undo changes the shown pair without an ack, so a choice-only slot could
  // hand an unacked key from one pair to another and the server would drop the answer.
  const clientKeys = useRef<Record<string, string>>({});
  // Mounted empty so the region exists before its text changes (SC 4.1.3).
  const [announcement, setAnnouncement] = useState("");
  const settled = useRef(new Set<string>());
  // Undo (spec §4): the last settled answer, and the pair being revisited.
  const [last, setLast] = useState<Answered | null>(null);
  const [revisit, setRevisit] = useState<Answered | null>(null);
  const shown: Pair = revisit ?? { itemA, itemB, heroA, heroB };
  const mode = revisit ? "revisit" : "pair";

  function settle(clientKey: string, keySlot: string, answered: Answered, outcome?: AckOutcome) {
    if (settled.current.has(clientKey)) return;
    settled.current.add(clientKey);
    delete clientKeys.current[keySlot];
    setError(null);
    pendingRef.current = false;
    // A rejected answer never stood: advance, but offer no Undo and claim no choice.
    if (outcome?.status === "rejected") {
      setLast(null);
      setRevisit(null);
      setPending(null);
      router.refresh();
      return;
    }
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

  // The pair changes under the person's focus, so say which pair is in front of them.
  function undo(answered: Answered) {
    setRevisit(answered);
    setAnnouncement(
      `Back to ${itemDisplayName(answered.itemA)} and ${itemDisplayName(answered.itemB)}. You chose ${answerLabel(answered)} — change it?`,
    );
  }

  function keepGoing() {
    setRevisit(null);
    setAnnouncement(`Back to ${itemDisplayName(itemA)} and ${itemDisplayName(itemB)}.`);
  }

  async function choose(result: Result, tapped: string) {
    if (submit.kind === "local") {
      submit.onDecision(result); // walkthrough: no keys, no pending, no refresh
      return;
    }
    if (pendingRef.current || closedElsewhere) return; // closed elsewhere: nothing more can land
    pendingRef.current = true;
    const pair = shown;
    const slot = `${mode}:${tapped}`;
    const keySlot = `${pair.itemA.id}:${pair.itemB.id}:${tapped}`;
    setPending(slot);
    setError(null);
    const key: QueueKey = { curatorId: submit.curatorId, sessionId: submit.sessionId, collectionId: submit.collectionId };
    const clientKey = (clientKeys.current[keySlot] ??= newClientKey());
    const decision = { itemAId: pair.itemA.id, itemBId: pair.itemB.id, result };

    // NEVER a bare fetch: the answer rides the queue as a batch-of-1.
    const alreadyRiding = readQueue(key).some((e) => e.clientKey === clientKey) || isInFlight(key, clientKey);
    if (!alreadyRiding && !settled.current.has(clientKey)) {
      const entry: PendingEntry = {
        kind: "decision",
        clientKey,
        type: "pairwise_compare",
        decision,
        enqueuedAt: new Date().toISOString(),
      };
      const persisted = await enqueue(key, entry, () => triggerFlush(key));
      if (persisted === "needs_fallback") {
        if (!(await directSubmit({ sessionId: submit.sessionId, collectionId: submit.collectionId }, entry))) {
          setError(FALLBACK_RETRY_LINE);
          pendingRef.current = false;
          setPending(null);
          return;
        }
        settle(clientKey, keySlot, { ...pair, result });
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
      pendingRef.current = false;
      setPending(null);
      setError(COMPARE_SLOW_SAVE_LINE);
      void ack.then((late) => settle(clientKey, keySlot, { ...pair, result }, late));
      return;
    }
    settle(clientKey, keySlot, { ...pair, result }, outcome);
  }

  const busy = pending !== null || closedElsewhere || undefined;
  const prior = revisit?.result;
  const pressed = (result: Result) => (prior === undefined ? undefined : prior === result);
  const ring = (result: Result) => (prior === result ? " ring-2 ring-primary ring-offset-2 ring-offset-ground" : "");
  const held = " aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
  const choices = [
    { item: shown.itemA, hero: shown.heroA, result: "item_a" as const, key: "a" },
    { item: shown.itemB, hero: shown.heroB, result: "item_b" as const, key: "b" },
  ];

  return (
    <div className="space-y-6">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {revisit && <p className="text-sm text-ink-soft">You chose {answerLabel(revisit)} — change it?</p>}

      {/* Tapping a card IS the choice (tap-first). Always two-up. */}
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        {choices.map(({ item, hero, result, key }) => (
          <button
            key={key}
            type="button"
            aria-disabled={busy}
            aria-label={`Choose ${itemDisplayName(item)}`}
            aria-pressed={pressed(result)}
            onClick={() => choose(result, key)}
            className={`group flex min-h-11 flex-col overflow-hidden rounded-card border border-rim bg-glass text-left transition-shadow duration-200 ease-gentle hover:shadow-lift focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ground${held}${ring(result)}`}
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
              <h3 className="text-ink">{saving === `${mode}:${key}` ? "Saving…" : itemDisplayName(item)}</h3>
              {item.brand && <p className="mt-1 text-sm text-ink-soft">{item.brand}</p>}
            </div>
          </button>
        ))}
      </div>

      {/* Escape hatches, deliberately quiet. */}
      <div className="flex items-center justify-center gap-2">
        <Button type="button" variant="ghost" size="sm" className={`min-h-11${held}${ring("tie")}`} aria-disabled={busy} aria-pressed={pressed("tie")} onClick={() => choose("tie", "tie")}>
          {saving === `${mode}:tie` ? "Saving…" : "Tie"}
        </Button>
        <span className="text-hairline" aria-hidden>
          &middot;
        </span>
        <Button type="button" variant="ghost" size="sm" className={`min-h-11${held}${ring("skip")}`} aria-disabled={busy} aria-pressed={pressed("skip")} onClick={() => choose("skip", "skip")}>
          {saving === `${mode}:skip` ? "Saving…" : "Skip"}
        </Button>
      </div>

      {/* One button that swaps Undo ↔ Keep going, so focus stays put (SC 2.4.3). */}
      {submit.kind === "session" && last && (
        <div className="flex justify-center">
          <button
            type="button"
            aria-disabled={busy}
            onClick={() => {
              if (pendingRef.current || closedElsewhere) return;
              if (revisit) keepGoing();
              else undo(last);
            }}
            className={`inline-flex h-11 items-center rounded-control px-2 text-sm text-ink-soft transition-colors hover:text-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-ground focus-visible:ring-primary${held}`}
          >
            {revisit ? "Keep going" : `Undo: ${answerLabel(last)}`}
          </button>
        </div>
      )}
      {error && !closedElsewhere && <p className="text-center text-sm text-ink-soft">{error}</p>}
    </div>
  );
}
