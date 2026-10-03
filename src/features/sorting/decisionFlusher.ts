"use client";

// decisionFlusher — ONE module-level drain engine per realm; the ONLY code
// that POSTs queued decisions/dispositions (spec §3.2, F12).
//
// Single-flight is promise-based, not skip-based: a caller that finds a drain
// in flight for the same queue awaits the SAME promise. A drain resolves only
// when every entry visible at call time (plus same-key entries enqueued
// mid-drain — the loop re-reads storage until empty) is acked, quarantined, or
// the failure taxonomy says stop.
//
// Cross-tab exclusion: every drain iteration — the re-read, the request, and
// the ack-removal/quarantine mutations — runs inside
// withWebLock('adored.flush.v1.{curatorId}.{sessionId}'), so one tab's
// ack-removal can never clobber another tab's concurrent enqueue (enqueue
// stays synchronous and lock-free; removal re-reads under the lock). Backoff
// waits happen OUTSIDE the lock so a stalled tab never starves the others.
//
// Notices are sticky per tab: the engine keeps the current one of each kind,
// and a surface that subscribes later hears it on subscribe. An entry stands
// until dismissed (dismissNotice) or resolved (a 2xx clears auth_required); a
// reload clears them all.
import { useEffect } from "react";
import { withWebLock } from "@/lib/web-lock";
import { BatchEntrySchema, type BatchResult } from "@/lib/decision-batch-schema";
import {
  PENDING_CHANGED_EVENT,
  deleteQueue,
  pendingStorageKey,
  quarantineEntries,
  readQueue,
  readQueueCollectionId,
  removeEntries,
  type PendingEntry,
  type QueueKey,
} from "./decisionQueue";

export interface DrainOptions {
  recovery?: boolean;
  keepalive?: boolean;
}

export type AckOutcome =
  | { status: "created" | "duplicate" }
  | { status: "rejected"; reason?: string };

export type FlushNotice =
  | { kind: "rejected_unknown_item"; count: number }
  | { kind: "quarantined"; count: number }
  | { kind: "session_conflict"; sessionId: string } // batch-route 409; names its sort so it never holds another
  | { kind: "disposition_superseded" } // disposition POST 409 (PreferenceExistsError)
  | { kind: "auth_required" };

export const BACKOFF_MS = [1_000, 4_000, 15_000, 60_000] as const;
export const FLUSH_PENDING_THRESHOLD = 5;
export const FLUSH_AFTER_OLDEST_MS = 4_000;
const BATCH_CHUNK = 50;

type DecisionEntry = Extract<PendingEntry, { kind: "decision" }>;
type DispositionEntry = Extract<PendingEntry, { kind: "disposition" }>;

// created/duplicate/rejected all ACK the entry (removed); everything else is
// the failure taxonomy: continue (mutated, take the next head), backoff
// (network/5xx — wait outside the lock, then retry), stop (401/403/mid-round
// 409/unnamed 4xx — preserve the queue and end the drain), done (queue empty
// or recovery disposal).
type StepResult = "done" | "continue" | "stop" | "backoff";

interface DrainTallies {
  rejected: number;
  quarantined: number;
}

// ---- module-level engine state (per JS realm) -------------------------------
const drains = new Map<string, Promise<void>>();
const attempts = new Map<string, number>();
const backoffPreempts = new Map<string, () => void>();
const keepaliveNext = new Set<string>();
const noticeSubscribers = new Set<(n: FlushNotice) => void>();
const currentNotices = new Map<FlushNotice["kind"], FlushNotice>();
const ackWaiters = new Map<string, Array<(o: AckOutcome) => void>>();
const ackOutcomes = new Map<string, AckOutcome>();
const ACK_OUTCOME_BUFFER = 200;
// Entries currently inside an active request (sent, not yet classified) — the
// undo-as-revisit introspection seam (F19): queued = in storage AND not here.
const inFlightEntries = new Set<string>();

function lockName(key: QueueKey): string {
  return `adored.flush.v1.${key.curatorId}.${key.sessionId}`;
}

function emitNotice(notice: FlushNotice): void {
  currentNotices.set(notice.kind, notice);
  for (const subscriber of [...noticeSubscribers]) subscriber(notice);
}

export function subscribeNotices(fn: (n: FlushNotice) => void): () => void {
  noticeSubscribers.add(fn);
  for (const notice of [...currentNotices.values()]) fn(notice);
  return () => void noticeSubscribers.delete(fn);
}

export function dismissNotice(kind: FlushNotice["kind"]): void {
  currentNotices.delete(kind);
}

function ackId(storageKey: string, clientKey: string): string {
  return `${storageKey}\u0000${clientKey}`;
}

function resolveAck(storageKey: string, clientKey: string, outcome: AckOutcome): void {
  const id = ackId(storageKey, clientKey);
  const waiters = ackWaiters.get(id);
  if (waiters !== undefined) {
    ackWaiters.delete(id);
    for (const waiter of waiters) waiter(outcome);
    return;
  }
  // Nobody waiting yet — buffer so an awaitAck issued just after the ack (the
  // compare surface enqueues, triggers, then awaits) still resolves.
  ackOutcomes.set(id, outcome);
  if (ackOutcomes.size > ACK_OUTCOME_BUFFER) {
    const oldest = ackOutcomes.keys().next().value;
    if (oldest !== undefined) ackOutcomes.delete(oldest);
  }
}

export function isInFlight(key: QueueKey, clientKey: string): boolean {
  return inFlightEntries.has(ackId(pendingStorageKey(key), clientKey));
}

export function awaitAck(key: QueueKey, clientKey: string): Promise<AckOutcome> {
  const id = ackId(pendingStorageKey(key), clientKey);
  const buffered = ackOutcomes.get(id);
  if (buffered !== undefined) {
    ackOutcomes.delete(id);
    return Promise.resolve(buffered);
  }
  return new Promise<AckOutcome>((resolve) => {
    const waiters = ackWaiters.get(id) ?? [];
    waiters.push(resolve);
    ackWaiters.set(id, waiters);
  });
}

// ---- drain ------------------------------------------------------------------

export function drain(keys: QueueKey[], opts: DrainOptions = {}): Promise<void> {
  if (keys.length === 1) return drainKey(keys[0], opts); // preserve promise identity for single-flight callers
  return Promise.all(keys.map((key) => drainKey(key, opts))).then(() => undefined);
}

export function triggerFlush(key: QueueKey): Promise<void> {
  return drain([key]);
}

function drainKey(key: QueueKey, opts: DrainOptions): Promise<void> {
  const storageKey = pendingStorageKey(key);
  const inFlight = drains.get(storageKey);
  if (inFlight !== undefined) return inFlight;
  const run = runDrain(key, opts).finally(() => {
    if (drains.get(storageKey) === run) drains.delete(storageKey);
  });
  drains.set(storageKey, run);
  return run;
}

async function runDrain(key: QueueKey, opts: DrainOptions): Promise<void> {
  const storageKey = pendingStorageKey(key);
  const tallies: DrainTallies = { rejected: 0, quarantined: 0 };
  try {
    for (;;) {
      const step = await withWebLock(lockName(key), () => performStep(key, opts, tallies));
      if (step === "continue") continue;
      if (step === "backoff") {
        const attempt = attempts.get(storageKey) ?? 0;
        attempts.set(storageKey, attempt + 1);
        await backoffWait(storageKey, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
        continue;
      }
      return; // "done" | "stop"
    }
  } finally {
    // One notice per kind per drain (F9) — a set of rejections/quarantines
    // collapses to a single quiet line.
    if (tallies.rejected > 0) emitNotice({ kind: "rejected_unknown_item", count: tallies.rejected });
    if (tallies.quarantined > 0) emitNotice({ kind: "quarantined", count: tallies.quarantined });
  }
}

async function performStep(key: QueueKey, opts: DrainOptions, tallies: DrainTallies): Promise<StepResult> {
  const entries = readQueue(key); // re-read from storage under the lock, every iteration
  if (entries.length === 0) return "done";
  const head = entries[0];
  if (head.kind === "decision") return flushDecisionRun(key, entries, opts, tallies);
  return flushDisposition(key, head, opts, tallies);
}

function quarantine(key: QueueKey, entries: PendingEntry[], tallies: DrainTallies): void {
  quarantineEntries(key, entries);
  removeEntries(
    key,
    entries.map((e) => e.clientKey),
  );
  tallies.quarantined += entries.length;
  const storageKey = pendingStorageKey(key);
  for (const entry of entries) {
    resolveAck(storageKey, entry.clientKey, { status: "rejected", reason: "quarantined" });
  }
}

function consumeKeepalive(storageKey: string, opts: DrainOptions): boolean {
  if (keepaliveNext.delete(storageKey)) return true;
  return opts.keepalive === true;
}

async function flushDecisionRun(
  key: QueueKey,
  entries: PendingEntry[],
  opts: DrainOptions,
  tallies: DrainTallies,
): Promise<StepResult> {
  const storageKey = pendingStorageKey(key);
  // Longest contiguous run of decision entries from the head, chunked ≤50,
  // order kept — a disposition entry flushes alone between runs.
  const run: DecisionEntry[] = [];
  for (const entry of entries) {
    if (entry.kind !== "decision") break;
    run.push(entry);
    if (run.length === BATCH_CHUNK) break;
  }

  // Pre-flush validation with the SHARED schema (spec §3.1): stale-shape
  // entries (a deploy mid-session) are quarantined, never sent, never retried.
  const valid: DecisionEntry[] = [];
  const offenders: PendingEntry[] = [];
  for (const entry of run) {
    const parsed = BatchEntrySchema.safeParse({
      type: entry.type,
      decision: entry.decision,
      clientKey: entry.clientKey,
    });
    if (parsed.success) valid.push(entry);
    else offenders.push(entry);
  }
  if (offenders.length > 0) quarantine(key, offenders, tallies);
  if (valid.length === 0) return "continue";

  const flightIds = valid.map((e) => ackId(storageKey, e.clientKey));
  for (const id of flightIds) inFlightEntries.add(id);
  try {
    let res: Response;
    try {
      res = await fetch(`/api/sessions/${key.sessionId}/decisions/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: consumeKeepalive(storageKey, opts),
        body: JSON.stringify({
          decisions: valid.map((e) => ({ type: e.type, decision: e.decision, clientKey: e.clientKey })),
        }),
      });
    } catch {
      return "backoff"; // network — queue intact (and back to merely queued), retry on the pinned schedule
    }

    if (res.ok) {
      attempts.set(storageKey, 0); // success resets the backoff schedule
      currentNotices.delete("auth_required"); // signed in again
      let results: BatchResult[] = [];
      try {
        results = ((await res.json()) as { results?: BatchResult[] }).results ?? [];
      } catch {
        results = [];
      }
      const byClientKey = new Map(results.map((r) => [r.clientKey, r]));
      const ackedKeys: string[] = [];
      for (const entry of valid) {
        const result = byClientKey.get(entry.clientKey);
        // An entry the server didn't echo is treated as duplicate: the partial
        // unique index makes a replay harmless, while re-queueing it forever
        // would wedge the drain.
        let outcome: AckOutcome;
        if (result?.status === "rejected") {
          outcome = { status: "rejected", reason: result.reason };
          tallies.rejected += 1;
        } else {
          outcome = { status: result?.status === "created" ? "created" : "duplicate" };
        }
        ackedKeys.push(entry.clientKey);
        resolveAck(storageKey, entry.clientKey, outcome);
      }
      removeEntries(key, ackedKeys); // exactly the acked keys — re-read + filter under the lock
      return "continue";
    }

    return handleBatchFailure(key, res.status, valid, opts, tallies);
  } finally {
    for (const id of flightIds) inFlightEntries.delete(id);
  }
}

function handleBatchFailure(
  key: QueueKey,
  status: number,
  sent: DecisionEntry[],
  opts: DrainOptions,
  tallies: DrainTallies,
): StepResult {
  if (status === 400) {
    // Whole-batch shape rejection. Everything sent already passed the shared
    // schema locally in this same lock iteration (safeParse is deterministic),
    // so re-validating here can find no offender — this is client/server
    // skew, and retrying would hot-loop. Quarantine the whole chunk;
    // resurfacing is the reconciliation (spec §3.1).
    quarantine(key, sent, tallies);
    return "continue";
  }
  if (status === 401) {
    emitNotice({ kind: "auth_required" });
    return "stop"; // preserve until re-auth
  }
  if (status === 403) {
    return "stop"; // preserve for this queue; retained until GC, never deleted live
  }
  if (status === 409) {
    emitNotice({ kind: "session_conflict", sessionId: key.sessionId });
    if (opts.recovery) {
      deleteQueue(key); // terminal-session disposal: surface once, then discard
      return "done";
    }
    return "stop"; // mid-round: stop gently, preserve
  }
  if (status >= 500) return "backoff";
  // Unnamed 4xx (e.g. 404 — session gone): preserve and stop; GC owns cleanup.
  return "stop";
}

async function flushDisposition(
  key: QueueKey,
  entry: DispositionEntry,
  opts: DrainOptions,
  tallies: DrainTallies,
): Promise<StepResult> {
  const storageKey = pendingStorageKey(key);
  const collectionId = readQueueCollectionId(key);
  if (collectionId === undefined) {
    // Unroutable without a collection — same terminal shelf as a stale shape.
    quarantine(key, [entry], tallies);
    return "continue";
  }

  const flightId = ackId(storageKey, entry.clientKey);
  inFlightEntries.add(flightId);
  let res: Response;
  try {
    if (entry.disposition === "clear") {
      res = await fetch(`/api/collections/${collectionId}/dispositions/${entry.itemId}`, {
        method: "DELETE",
        keepalive: consumeKeepalive(storageKey, opts),
      });
    } else {
      res = await fetch(`/api/collections/${collectionId}/dispositions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: consumeKeepalive(storageKey, opts),
        body: JSON.stringify({ itemId: entry.itemId, disposition: entry.disposition }),
      });
    }
  } catch {
    return "backoff";
  } finally {
    inFlightEntries.delete(flightId);
  }

  if (res.ok) {
    attempts.set(storageKey, 0);
    currentNotices.delete("auth_required"); // signed in again
    removeEntries(key, [entry.clientKey]);
    return "continue";
  }
  if (res.status === 409) {
    // PreferenceExistsError: the item was triaged before this disposition
    // flushed — permanent, per-entry (disposed ⇔ untriaged). Remove it, one
    // gentle notice, and the drain CONTINUES: recovery of [set_aside X (409),
    // triage Y] never discards Y (F4).
    removeEntries(key, [entry.clientKey]);
    emitNotice({ kind: "disposition_superseded" });
    return "continue";
  }
  if (res.status === 404) {
    removeEntries(key, [entry.clientKey]); // item gone — drop silently, continue
    return "continue";
  }
  if (res.status === 400) {
    quarantine(key, [entry], tallies);
    return "continue";
  }
  if (res.status === 401) {
    emitNotice({ kind: "auth_required" });
    return "stop";
  }
  if (res.status === 403) return "stop";
  if (res.status >= 500) return "backoff";
  return "stop";
}

// ---- backoff (preemptible by pagehide) ---------------------------------------

function backoffWait(storageKey: string, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      backoffPreempts.delete(storageKey);
      resolve();
    }, ms);
    backoffPreempts.set(storageKey, () => {
      clearTimeout(timer);
      backoffPreempts.delete(storageKey);
      resolve();
    });
  });
}

function preemptBackoff(key: QueueKey): void {
  const storageKey = pendingStorageKey(key);
  keepaliveNext.add(storageKey); // the preempted iteration's request must survive the unload
  backoffPreempts.get(storageKey)?.();
}

// ---- triggers hook ------------------------------------------------------------

// Triggers ONLY (spec §3.2): ≥5 pending · 4 s after the oldest pending entry ·
// pagehide/visibilitychange:hidden → keepalive drain that preempts an active
// backoff wait. Round-end / compare / pause callers use triggerFlush directly.
export function useDecisionFlusher(key: QueueKey): void {
  const { curatorId, sessionId, collectionId } = key;
  useEffect(() => {
    const effectKey: QueueKey = { curatorId, sessionId, collectionId };
    const storageKey = pendingStorageKey(effectKey);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const schedule = () => {
      clearTimer();
      const entries = readQueue(effectKey);
      if (entries.length === 0) return;
      if (entries.length >= FLUSH_PENDING_THRESHOLD) {
        void drain([effectKey]);
        return;
      }
      const oldestAt = Date.parse(entries[0].enqueuedAt);
      const dueIn = Number.isFinite(oldestAt)
        ? Math.max(0, oldestAt + FLUSH_AFTER_OLDEST_MS - Date.now())
        : 0;
      timer = setTimeout(() => {
        timer = null;
        void drain([effectKey]);
      }, dueIn);
    };
    const onPendingChanged = (event: Event) => {
      if ((event as CustomEvent<string>).detail === storageKey) schedule();
    };
    const flushForUnload = () => {
      preemptBackoff(effectKey);
      void drain([effectKey], { keepalive: true });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushForUnload();
    };
    window.addEventListener(PENDING_CHANGED_EVENT, onPendingChanged);
    window.addEventListener("pagehide", flushForUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule(); // pick up anything already queued at mount (e.g. a reload)
    return () => {
      clearTimer();
      window.removeEventListener(PENDING_CHANGED_EVENT, onPendingChanged);
      window.removeEventListener("pagehide", flushForUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [curatorId, sessionId, collectionId]);
}
