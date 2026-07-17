"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dedupeDecisionsLatestWins, type MovedDecision } from "@/lib/what-moved";
import { getRoundBox, type RoundBox } from "@/lib/round-preference";
import { useDeviceValue } from "@/lib/useDeviceValue";
import { enqueue, newClientKey, removeQueued, type PendingEntry, type QueueKey } from "./decisionQueue";
import { awaitAck, isInFlight, triggerFlush, useDecisionFlusher, type AckOutcome } from "./decisionFlusher";

const MINUTE_MS = 60_000;

const boxToMs = (box: RoundBox): number | null => (box === "none" ? null : box * MINUTE_MS);
const storedBoxMs = (): number | null => boxToMs(getRoundBox());

// TONE register — a gentle stumble, never "error"/"failed" (matches the
// provider's existing line).
export const STUMBLE_LINE = "That didn't go through — give it another try in a moment.";

/** The decision-entry `type` an optimistic round enqueues (mirrors `PendingEntry`). */
type DecisionType = Extract<PendingEntry, { kind: "decision" }>["type"];

interface RevisitState {
  itemId: string;
  clientKey: string;
  label: string;
}

/** The `Back`-of-queue tap's verdict when a *queued* answer was undone: the
 *  round un-advances and un-counts this item (in-flight/acked/rejected paths
 *  drive `revisit` internally and return `null`). */
interface RepresentFresh {
  itemId: string;
}

export interface UseOptimisticRoundOptions<D extends Record<string, unknown>> {
  curatorId: string;
  sessionId: string;
  /** ULID collection.id — the queue key (never the slug). */
  collectionId: string;
  /** The decision type stamped on every queue entry AND the fallback POST body. */
  decisionType: DecisionType;
  /** Server decision log merged into the frozen recap; usage passes `[]`. */
  serverLog: MovedDecision[];
  /** The round mounted onto an empty queue: nothing to flush. */
  initialQueueEmpty: boolean;
  /** This round's own queue fork is exhausted (round-computed; the hook adds the clock). */
  queueExhausted: boolean;
  /** The single-route fallback POST body when localStorage is unavailable (F18). */
  fallbackBody: (decision: D, clientKey: string) => Record<string, unknown>;
  /** Human label for the recap/revisit history (e.g. "Love"). */
  labelFor: (itemId: string, decision: D) => string;
  /** Maps the decision to a `MovedDecision` for the recap. */
  toMoved: (decision: D, createdAtMs: number) => MovedDecision;
}

export interface OptimisticRound<D extends Record<string, unknown>> {
  key: QueueKey;
  // Round clock (RoundTimer wiring).
  startedAtMs: number;
  boxMs: number | null;
  expired: boolean;
  onExpire: () => void;
  /** Mid-round length switch (parent D2): re-arm `boxMs` against the UNCHANGED
   *  `startedAtRef` — "none" → null, else box·MINUTE_MS. Never resets the clock. */
  onBoxChange: (box: RoundBox) => void;
  // Frozen recap (F5).
  recapDecisions: MovedDecision[];
  recapNowMs: number | undefined;
  windowStartMs: number;
  /** Un-end a round (bring-back restore): drop the recap so the item can refocus. */
  reopenRound: () => void;
  // Persist-before-advance + fallback (F18).
  stumble: boolean;
  /** Enqueue a decision; resolves `true` once persisted/acked so the caller
   *  advances + counts, `false` on a busy re-entry or a failed fallback. */
  submitDecision: (itemId: string, decision: D) => Promise<boolean>;
  // Undo-as-revisit (F19).
  revisit: RevisitState | null;
  /** True while a prior answer exists to step back to (and not already revisiting). */
  canGoBack: boolean;
  goBack: () => RepresentFresh | null;
  clearRevisit: () => void;
}

/**
 * The optimistic-round engine shared by triage and usage rounds (spec §3.4):
 * the flusher wiring, persist-before-advance enqueue with the F18 quota
 * fallback, this round's tap log + frozen recap + the exactly-once end
 * sequence (F15 — a drain, and no route refresh: purses-hzwj), the
 * undo-as-revisit state machine (F19), and the round
 * clock. Queue-state derivation (`entries`/`handled`/passes → `queueExhausted`)
 * and every round-specific surface (dispositions, labels, counts) stay in the
 * consuming component; the hook never owns the queue fork.
 */
export function useOptimisticRound<D extends Record<string, unknown>>({
  curatorId,
  sessionId,
  collectionId,
  decisionType,
  serverLog,
  initialQueueEmpty,
  queueExhausted,
  fallbackBody,
  labelFor,
  toMoved,
}: UseOptimisticRoundOptions<D>): OptimisticRound<D> {
  const key = useMemo<QueueKey>(
    () => ({ curatorId, sessionId, collectionId }),
    [curatorId, sessionId, collectionId],
  );
  useDecisionFlusher(key); // 5-pending / 4 s / pagehide triggers — the only wiring here

  // Round-local snapshot: mid-round prop updates (e.g. a legacy affordance's
  // refresh) never perturb the round (F20). A never-updated state cell IS the
  // mount snapshot, and — unlike a ref — the recap may read it while rendering.
  const [serverLogAtMount] = useState(serverLog);
  const initialQueueEmptyRef = useRef(initialQueueEmpty);
  // This round's tap log — pending, in-flight AND already-acked entries alike,
  // so the recap can never undercount what the person actually moved (F5). It
  // doubles as the revisit history: the tail is what "Back" re-presents. State,
  // not a ref: `recapDecisions` and `canGoBack` are rendered from it.
  const [roundLog, setRoundLog] = useState<
    Array<{ clientKey: string; itemId: string; label: string; moved: MovedDecision }>
  >([]);
  // Ack outcomes recorded as they land, so "Back" can tell a standing answer
  // (created/duplicate) from a rejected one (no-op) without racing the drain.
  const outcomesRef = useRef(new Map<string, AckOutcome>());
  // Undo-as-revisit (F19): non-null while an in-flight/acked answer is being
  // re-presented with its standing choice selected.
  const [revisit, setRevisit] = useState<RevisitState | null>(null);

  // The round's clock is client-owned and fixed at mount (RoundSurface's pattern) —
  // a lazy initializer, since Date.now() must not be called on every render.
  const [startedAtMs] = useState(() => Date.now());
  // The stored box is device-local: no timer through SSR/hydration, then the real box
  // right after mount (useDeviceValue). A mid-round switch overrides it.
  const storedBox = useDeviceValue<number | null>(storedBoxMs, null);
  const [chosenBoxMs, setChosenBoxMs] = useState<{ ms: number | null } | null>(null);
  const boxMs = chosenBoxMs === null ? storedBox : chosenBoxMs.ms;
  const [expired, setExpired] = useState(false);
  const [frozen, setFrozen] = useState<{ decisions: MovedDecision[]; endedAtMs: number } | null>(null);
  const [stumble, setStumble] = useState(false);
  const busyRef = useRef(false);
  const endSequenceRan = useRef(false);

  // Stable so the consumer can list it in an effect's deps (bring-back restore)
  // without re-firing the effect every render — it only touches setters/refs.
  const reopenRound = useCallback(() => {
    endSequenceRan.current = false;
    setFrozen(null);
  }, []);

  // Mid-round length switch (parent D2): recompute the box against the UNCHANGED
  // start — RoundTimer's effect re-arms on the boxMs prop, so "none" drops the
  // countdown and a box shorter than the elapsed time expires at the next tick.
  const onBoxChange = useCallback((box: RoundBox) => {
    setChosenBoxMs({ ms: boxToMs(box) });
  }, []);

  const ended = expired || queueExhausted;

  useEffect(() => {
    if (!ended || endSequenceRan.current) return;
    endSequenceRan.current = true;
    // Frozen recap (F5): computed ONCE at round end — the pre-round server log
    // (window-filtered away by whatMoved) merged with this round's client tap
    // log. The round-end flush proceeds BEHIND it; the recap never re-renders
    // from server data (prevents the double-count window).
    setFrozen({
      decisions: [...serverLogAtMount, ...roundLog.map((e) => e.moved)],
      endedAtMs: Date.now(),
    });
    // A round that never was (mounted onto an empty queue) has nothing to flush.
    if (initialQueueEmptyRef.current) return;
    // Flush only — NO router.refresh() (purses-hzwj). Nothing on this route
    // consumes a refreshed payload: the recap is frozen and the round's server
    // props are snapshotted at mount. A refresh of the route the person is
    // leaving stays in flight past the recap, and Next falls back to a hard
    // navigation to the current URL when a real navigation starts mid-commit —
    // silently eating the tap that took them to /compare. The freshness the
    // refresh used to buy the NEXT route (the hub) now comes from
    // `experimental.staleTimes: { dynamic: 0 }` in next.config.mjs, which races
    // nothing.
    void triggerFlush(key);
    // `roundLog`/`serverLogAtMount` are read, not watched: the end sequence is
    // one-shot (endSequenceRan), so a later log change can never re-freeze the recap.
  }, [ended, key, roundLog, serverLogAtMount]);

  async function submitDecision(itemId: string, decision: D): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    try {
      setStumble(false);
      const clientKey = newClientKey();
      const enqueuedAt = new Date().toISOString();
      const persisted = await enqueue(
        key,
        { kind: "decision", clientKey, type: decisionType, decision, enqueuedAt },
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
            body: JSON.stringify(fallbackBody(decision, clientKey)),
          });
          landed = res.ok;
        } catch {
          landed = false;
        }
        if (!landed) {
          setStumble(true);
          return false; // the item stays; the person simply tries again
        }
        outcomesRef.current.set(clientKey, { status: "created" }); // the awaited submit IS the ack
      } else {
        void awaitAck(key, clientKey).then((o) => outcomesRef.current.set(clientKey, o));
      }
      setRoundLog((prev) => [
        ...prev,
        {
          clientKey,
          itemId,
          label: labelFor(itemId, decision),
          moved: toMoved(decision, Date.parse(enqueuedAt)),
        },
      ]);
      setRevisit(null); // a superseding answer resumes the round
      return true;
    } finally {
      busyRef.current = false;
    }
  }

  // The round's back affordance: re-present the last answered item (spec §3.3).
  // Still queued → pure client undo (the caller un-advances + un-counts the
  // returned item). In-flight/acked → the answer STANDS and is shown as the
  // standing choice (F19). Rejected → nothing stands; no-op (F9 — resurfacing
  // is the reconciliation).
  function goBack(): RepresentFresh | null {
    if (revisit !== null) return null;
    const last = roundLog[roundLog.length - 1];
    if (last === undefined) return null;
    const outcome = outcomesRef.current.get(last.clientKey);
    if (outcome?.status === "rejected") return null;
    if (outcome === undefined && !isInFlight(key, last.clientKey) && removeQueued(key, last.clientKey)) {
      // The answer never left the device: remove it, re-present fresh (F20 decrement).
      setRoundLog((prev) => prev.slice(0, -1));
      return { itemId: last.itemId };
    }
    setRevisit({ itemId: last.itemId, clientKey: last.clientKey, label: last.label });
    return null;
  }

  return {
    key,
    startedAtMs,
    boxMs,
    expired,
    onExpire: () => setExpired(true),
    onBoxChange,
    // Dedup latest-wins BEFORE the recap counts these (F5): the append-on-ack log
    // holds a second entry for any item answered, flushed, then changed via
    // Back-as-revisit — one physical item must never show in two outcome lines.
    recapDecisions: dedupeDecisionsLatestWins(
      frozen?.decisions ?? [...serverLogAtMount, ...roundLog.map((e) => e.moved)],
    ),
    recapNowMs: frozen?.endedAtMs,
    windowStartMs: startedAtMs,
    reopenRound,
    stumble,
    submitDecision,
    revisit,
    canGoBack: revisit === null && roundLog.length > 0,
    goBack,
    clearRevisit: () => setRevisit(null),
  };
}
