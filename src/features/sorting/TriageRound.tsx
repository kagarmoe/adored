"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import type { MovedDecision } from "@/lib/what-moved";
import { getRoundBox } from "@/lib/round-preference";
import { Card } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { DecisionControls } from "./DecisionControls";
import { triageDecisions, type TriageResult } from "./roundCopy";
import { DeferControl } from "./DeferControl";
import { SetAsideButton } from "./SetAsideButton";
import { useOptionalTriageUndo } from "./TriageUndoProvider";
import { RoundShell } from "./RoundShell";
import { RoundTimer } from "./RoundTimer";
import { WhatMoved } from "./WhatMoved";
import { enqueue, newClientKey, type QueueKey } from "./decisionQueue";
import { triggerFlush, useDecisionFlusher } from "./decisionFlusher";

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
  // so the recap can never undercount what the person actually moved (F5).
  const roundLogRef = useRef<Array<{ clientKey: string; itemId: string; moved: MovedDecision }>>([]);

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

  const current = entries.find((e) => !handled.has(e.item.id));
  const ended = expired || current === undefined;

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
      }
      roundLogRef.current.push({
        clientKey,
        itemId: target.id,
        moved: { type: "triage", createdAt: Date.parse(enqueuedAt), decision },
      });
      setNewlyDecided((prev) => new Set(prev).add(target.id)); // idempotent — a re-answer never double-counts
      advancePast(target.id);
    } finally {
      busyRef.current = false;
    }
  }

  function handleDefer(target: Item) {
    // Fire-and-forget: the tap path never awaits the network. The item moves to
    // the round's tail as deferred (today's resurface semantics, kept round-local).
    // TODO(Task 13): route through the provider/queue like set-aside.
    void fetch(`/api/collections/${collectionId}/dispositions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: target.id, disposition: "deferred" }),
    }).catch(() => undefined);
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
      {current === undefined || expired ? (
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
          </div>

          {stumble && (
            <p role="status" className="text-sm text-ink-soft">
              {STUMBLE_LINE}
            </p>
          )}

          {current.deferred && (
            <div className="flex items-center gap-2 rounded-control bg-content-mid px-4 py-3 text-ink transition-opacity duration-300 ease-gentle motion-reduce:transition-none">
              <span aria-hidden className="text-lg leading-none">☾</span>
              <p className="text-sm">
                <span className="font-medium">Ready when you are.</span>{" "}
                This one was waiting for you — no rush.
              </p>
            </div>
          )}

          <ItemCard
            item={current.item}
            collectionId={collectionSlugOrId}
            heroPhotoUrl={current.heroPhotoUrl}
            imageClassName="h-64"
          />
          <Card padding="lg">
            <div className="space-y-4">
              <DecisionControls
                key={current.item.id}
                submit={{ kind: "local", onDecision: (d) => void handleTriage(current.item, d) }}
                type="triage"
                decisions={triageDecisions(current.item.id)}
              />
              {/* Quiet, demoted escapes below a hairline — same layout as before;
                  both advance optimistically through the round's own handlers. */}
              <div className="flex flex-wrap items-start gap-x-6 gap-y-3 border-t border-hairline pt-3">
                <DeferControl
                  submit={{ kind: "local", onDecision: () => handleDefer(current.item) }}
                  itemId={current.item.id}
                />
                <SetAsideButton
                  submit={{ kind: "local", onDecision: () => handleSetAside(current.item) }}
                  itemId={current.item.id}
                  itemName={current.item.name}
                />
              </div>
            </div>
          </Card>
        </div>
      )}
    </RoundShell>
  );
}
