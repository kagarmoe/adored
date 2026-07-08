"use client";

// The shared session status-PATCH client helper (spec §3.2; plan Task 16).
// Every session-state transition that can strand queued decisions routes its
// fetch through here so the flush rule lives in ONE place:
//
// - paused    → best-effort, NON-BLOCKING pre-flush (F8): wait at most
//               PAUSE_PREFLUSH_BOUND_MS, then PATCH regardless — stepping away
//               is never gated on the network (the queue persists and
//               PendingDecisionsGate recovers it on return).
// - terminal  → strict flush-then-complete (spec §3.2 / parent ARCH-2): the
//               drain is fully awaited and a taxonomy-stopped drain (entries
//               left behind) FAILS the transition — a terminal session would
//               409 those entries and recovery would discard them.
//               (No production caller PATCHes a terminal status today; Epic 5's
//               Decide surface becomes the first — it inherits the rule.)
// - active    → plain PATCH, no flush (resuming changes nothing to land).
// - DELETE    → abandon-with-undo (orchestrator resolution #2): same bounded
//               best-effort pre-flush, then DELETE — decisions made before
//               setting a session aside should land now, and a later restore
//               plus the gate recovers whatever the bound left behind.
import { drain, triggerFlush } from "./decisionFlusher";
import { readQueue, type QueueKey } from "./decisionQueue";

export const PAUSE_PREFLUSH_BOUND_MS = 2_000;

export type SessionStatus = "active" | "paused" | "completed" | "abandoned";

async function preflushBounded(key: QueueKey): Promise<void> {
  await Promise.race([
    triggerFlush(key).catch(() => undefined), // a stumbling flush never blocks the person
    new Promise<void>((resolve) => {
      setTimeout(resolve, PAUSE_PREFLUSH_BOUND_MS);
    }),
  ]);
}

export async function patchSessionStatus(key: QueueKey, status: SessionStatus): Promise<Response> {
  if (status === "paused") {
    await preflushBounded(key);
  } else if (status === "completed" || status === "abandoned") {
    await drain([key]);
    if (readQueue(key).length > 0) {
      // The drain stopped per the taxonomy (401/403/409/…) with entries still
      // queued — completing now would strand them behind a terminal session.
      throw new Error("Some answers are still on their way — this can finish once they land.");
    }
  }
  return fetch(`/api/sessions/${key.sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export async function deleteSessionWithPreflush(key: QueueKey): Promise<Response> {
  await preflushBounded(key);
  return fetch(`/api/sessions/${key.sessionId}`, { method: "DELETE" });
}
