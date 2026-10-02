"use client";

import { useMemo, useRef, useState } from "react";
import { enqueue, newClientKey, removeQueued, type QueueKey } from "./decisionQueue";
import { awaitAck, isInFlight, triggerFlush, useDecisionFlusher, type AckOutcome } from "./decisionFlusher";
import { triageDecisions, type TriageResult } from "./roundCopy";

// TONE register — a gentle stumble, never "error"/"failed".
export const STUMBLE_LINE = "That didn't go through — give it another try in a moment.";

type TriageDecision = { itemId: string; result: TriageResult };

interface RevisitState {
  itemId: string;
  label: string;
}

export interface OptimisticRound {
  key: QueueKey;
  stumble: boolean;
  /** Persist-before-advance: resolves true once the answer is safe, false to stay put. */
  submitDecision: (itemId: string, decision: TriageDecision) => Promise<boolean>;
  revisit: RevisitState | null;
  canGoBack: boolean;
  /** The last answer's label for "Undo: …"; null when there is none. */
  lastLabel: string | null;
  /**
   * Undo the last answer: a still-queued one is removed (`fresh` — show the piece
   * as new); one already sent is re-presented (`revisit`). null when nothing moved.
   */
  goBack: () => { itemId: string; label: string; fresh: boolean } | null;
  clearRevisit: () => void;
}

const labelFor = (decision: TriageDecision) =>
  triageDecisions(decision.itemId).find((t) => t.decision.result === decision.result)?.label ?? decision.result;

/**
 * The feelings phase's answer engine: flusher wiring, persist-before-advance with
 * the storage fallback, and Undo. A still-queued answer is removed outright; one
 * already sent is re-presented with its choice selected, and the next tap
 * supersedes it (the log is append-only, latest wins).
 */
export function useOptimisticRound({
  curatorId,
  sessionId,
  collectionId,
}: {
  curatorId: string;
  sessionId: string;
  /** ULID collection.id — the queue key (never the slug). */
  collectionId: string;
}): OptimisticRound {
  const key = useMemo<QueueKey>(() => ({ curatorId, sessionId, collectionId }), [curatorId, sessionId, collectionId]);
  useDecisionFlusher(key);
  const [answers, setAnswers] = useState<Array<{ clientKey: string; itemId: string; label: string }>>([]);
  // Ack outcomes as they land, so Undo can tell a standing answer from a rejected one.
  const outcomesRef = useRef(new Map<string, AckOutcome>());
  const [revisit, setRevisit] = useState<RevisitState | null>(null);
  const [stumble, setStumble] = useState(false);
  const busyRef = useRef(false);

  async function submitDecision(itemId: string, decision: TriageDecision): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    try {
      setStumble(false);
      const clientKey = newClientKey();
      const persisted = await enqueue(
        key,
        { kind: "decision", clientKey, type: "triage", decision, enqueuedAt: new Date().toISOString() },
        () => triggerFlush(key), // quota → shrink the queue, retry once (F18)
      );
      if (persisted === "needs_fallback") {
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
          return false;
        }
        outcomesRef.current.set(clientKey, { status: "created" });
      } else {
        void awaitAck(key, clientKey).then((o) => outcomesRef.current.set(clientKey, o));
      }
      setAnswers((prev) => [...prev, { clientKey, itemId, label: labelFor(decision) }]);
      setRevisit(null);
      return true;
    } finally {
      busyRef.current = false;
    }
  }

  function goBack(): { itemId: string; label: string; fresh: boolean } | null {
    if (revisit !== null) return null;
    const last = answers[answers.length - 1];
    if (last === undefined) return null;
    const outcome = outcomesRef.current.get(last.clientKey);
    if (outcome?.status === "rejected") return null;
    if (outcome === undefined && !isInFlight(key, last.clientKey) && removeQueued(key, last.clientKey)) {
      setAnswers((prev) => prev.slice(0, -1));
      return { itemId: last.itemId, label: last.label, fresh: true };
    }
    setRevisit({ itemId: last.itemId, label: last.label });
    return { itemId: last.itemId, label: last.label, fresh: false };
  }

  const last = answers[answers.length - 1];
  return {
    key,
    stumble,
    submitDecision,
    revisit,
    canGoBack: revisit === null && last !== undefined,
    lastLabel: last?.label ?? null,
    goBack,
    clearRevisit: () => setRevisit(null),
  };
}
