"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@/types";
import type { MovedDecision } from "@/lib/what-moved";
import { Button, Card } from "@/components/ui";
import { ItemCard } from "@/features/items/ItemCard";
import { DecisionControls } from "./DecisionControls";
import {
  ROUND_COPY,
  USAGE_PASS_ARIA_LABEL,
  USAGE_PASS_LABEL,
  USAGE_PASS_TITLE,
  usageDecisions,
  type UsageResult,
} from "./roundCopy";
import { RoundShell } from "./RoundShell";
import { RoundTimer } from "./RoundTimer";
import { RoundLengthChooser } from "./RoundLengthChooser";
import { WhatMoved } from "./WhatMoved";
import { STUMBLE_LINE, useOptimisticRound } from "./useOptimisticRound";
import { PendingNotices } from "./pendingNotices";
import { markUsageRoundRan } from "@/lib/usage-round-prefs";

export interface UsageRoundQueueEntry {
  item: Item;
  heroPhotoUrl?: string;
}

interface UsageRoundProps {
  curatorId: string;
  sessionId: string;
  /** ULID collection.id — the queue key + decision endpoint (never the slug). */
  collectionId: string;
  /** collection.slug ?? collection.id — ItemCard's link base. */
  collectionSlugOrId: string;
  /** Server-selected usage-unknown remainder (selectUsageQueue), in round order. */
  queue: UsageRoundQueueEntry[];
  /** Recap server-log prop; the page passes [] (§3.3 — the window filter owns it). */
  decisions: MovedDecision[];
  /** Server-computed usage-known count (usageByItemId.size) — the answered-cue seed. */
  usageKnownSeed: number;
  hubHref: string;
}

/** The answered-count cue's one home ("{n} answered so far", F20). */
export const answeredSoFar = (n: number): string => `${n} answered so far`;

/**
 * The optimistic usage round (spec §3.4): the SECOND consumer of
 * `useOptimisticRound`. It rides the shared machine for persist-before-advance,
 * the frozen recap + one-refresh end sequence (F15), undo-as-revisit (F19), and
 * the round clock — and forks only where usage genuinely differs:
 *
 *  - Three affordances: Yes / Not these days / Skip. No dispositions, no undo
 *    provider (D2).
 *  - `pass` writes NOTHING — no event, no queue entry, no log line: a pass counter
 *    cycles the item to the tail once, and a second pass drops it from the queue
 *    (staying usage-unknown). Termination is provable at ≤ 2n presentation slots.
 *  - Demotion memory: `markUsageRoundRan` is written only when the round ends
 *    WITHOUT engagement — always on queue exhaustion, and on timer expiry only
 *    when no answer landed. Never on Pause / navigation / unmount.
 */
export function UsageRound({
  curatorId,
  sessionId,
  collectionId,
  collectionSlugOrId,
  queue,
  decisions,
  usageKnownSeed,
  hubHref,
}: UsageRoundProps) {
  const router = useRouter();

  const seedRef = useRef(usageKnownSeed);
  const [entries, setEntries] = useState<UsageRoundQueueEntry[]>(queue);
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const [newlyAnswered, setNewlyAnswered] = useState<ReadonlySet<string>>(new Set());
  // Round-local, ephemeral pass counter — deliberately a ref (nothing renders it,
  // and a crash forgetting it is by design, parent D7).
  const passesRef = useRef(new Map<string, number>());

  // Usage's own queue fork: the head not yet handled. Everything about advancing
  // that decision optimistically rides the shared hook.
  const current = entries.find((e) => !handled.has(e.item.id));
  const queueExhausted = current === undefined;
  const round = useOptimisticRound<{ itemId: string; result: UsageResult }>({
    curatorId,
    sessionId,
    collectionId,
    decisionType: "usage",
    serverLog: decisions,
    initialQueueEmpty: queue.length === 0,
    queueExhausted,
    fallbackBody: (decision, clientKey) => ({ type: "usage", decision, clientKey }),
    labelFor: (itemId, decision) =>
      usageDecisions(itemId).find((u) => u.decision.result === decision.result)?.label ??
      decision.result,
    toMoved: (decision, createdAtMs) => ({ type: "usage", createdAt: createdAtMs, decision }),
  });
  const { revisit, expired } = round;

  // Demotion memory (spec §3.8): fire once when the round ends without engagement.
  // Queue exhaustion always writes; a timer-expired round writes only if no answer
  // landed. An in-progress unmount never reaches here (the effect runs on the
  // end-transition, not on cleanup).
  const ranRef = useRef(false);
  const ended = expired || queueExhausted;
  useEffect(() => {
    if (!ended || ranRef.current) return;
    ranRef.current = true;
    if (queueExhausted || newlyAnswered.size === 0) {
      markUsageRoundRan(curatorId, sessionId);
    }
  }, [ended, queueExhausted, newlyAnswered, curatorId, sessionId]);

  // While revisiting, the standing item is shown instead of the queue head.
  const revisitEntry = revisit === null ? undefined : entries.find((e) => e.item.id === revisit.itemId);
  const shown = revisitEntry ?? current;

  function advancePast(itemId: string) {
    setHandled((prev) => new Set(prev).add(itemId));
  }

  async function handleUsage(target: Item, decision: { itemId: string; result: UsageResult }) {
    if (!(await round.submitDecision(target.id, decision))) return;
    setNewlyAnswered((prev) => new Set(prev).add(target.id)); // idempotent — a re-answer never double-counts
    advancePast(target.id);
  }

  // A pass writes NOTHING: it bumps the round-local counter and either cycles the
  // item to the tail (first showing) or drops it from the queue (second showing,
  // staying usage-unknown). No enqueue, no log, no count.
  function pass(target: Item) {
    const seen = (passesRef.current.get(target.id) ?? 0) + 1;
    passesRef.current.set(target.id, seen);
    if (seen >= 2) {
      advancePast(target.id);
      return;
    }
    setEntries((prev) => {
      const found = prev.find((e) => e.item.id === target.id);
      if (!found) return prev;
      return [...prev.filter((e) => e.item.id !== target.id), found];
    });
  }

  // The round's back affordance: the shared machine decides queued vs standing vs
  // no-op. A queued undo comes back here to un-advance the item and decrement this
  // round's count (F20) — the two pieces of state the hook never owns.
  function goBack() {
    const fresh = round.goBack();
    if (fresh === null) return;
    setNewlyAnswered((prev) => {
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

  // Ceiling-free cue (F20): seed + this round's answered set. Ticks on the tap,
  // never on a pass or the flush.
  const answered = seedRef.current + newlyAnswered.size;

  const roundOver = shown === undefined || expired;
  const timer = (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <RoundTimer
          startedAtMs={round.startedAtMs}
          boxMs={round.boxMs}
          onExpire={round.onExpire}
          roundLabel="This round"
        />
      </div>
      {/* Switchable before AND during a round (parent D2); live-only — the recap
          has no length to choose. */}
      {!roundOver && <RoundLengthChooser onChange={round.onBoxChange} />}
    </div>
  );

  return (
    <RoundShell
      step={2}
      totalSteps={4}
      roundLabel="This round"
      timer={timer}
      onPause={() => router.push(hubHref)}
    >
      {/* The flush engine's one quiet voice — OUTSIDE the content swap so a notice
          raised mid-round survives into the recap (F9). */}
      <div className="mx-auto max-w-xl">
        <PendingNotices />
      </div>
      {roundOver ? (
        <WhatMoved
          decisions={round.recapDecisions}
          windowStartMs={round.windowStartMs}
          nowMs={round.recapNowMs}
          hubHref={hubHref}
        />
      ) : (
        <div className="mx-auto max-w-xl space-y-6">
          <div>
            <h1 tabIndex={-1} className="text-3xl text-ink">
              {ROUND_COPY.usage.name}
            </h1>
            {answered > 0 && (
              <p className="mt-2 text-sm text-ink-soft">{answeredSoFar(answered)}</p>
            )}
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
                submit={{ kind: "local", onDecision: (d) => void handleUsage(shown.item, d) }}
                type="usage"
                decisions={usageDecisions(shown.item.id)}
                priorAnswer={revisit?.label}
              />
              {revisit === null ? (
                /* The demoted-escape slot: an always-available, write-nothing pass.
                   Its contract lives in the accessible name (WCAG 2.5.3). */
                <div className="border-t border-hairline pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => pass(shown.item)}
                    title={USAGE_PASS_TITLE}
                    aria-label={USAGE_PASS_ARIA_LABEL}
                  >
                    {USAGE_PASS_LABEL}
                  </Button>
                </div>
              ) : (
                /* A standing answer can't be passed — offer a gentle way to resume. */
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
