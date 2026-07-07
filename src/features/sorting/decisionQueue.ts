// Client decision queue — pure + storage, no React (spec §3.1). One versioned,
// curator-keyed envelope per (curator, session) in localStorage; array order in
// storage IS flush order (no seq field). Every read verifies the envelope's
// curatorId/sessionId against the requested key and never deletes a foreign or
// corrupt blob — sweepExpired (GC) owns eventual cleanup. Storage guards follow
// the round-preference house pattern (typeof window + try/catch) so private
// mode degrades instead of throwing.
import { ulid } from "ulid";

export interface QueueKey {
  curatorId: string;
  sessionId: string;
  // Stamped onto the envelope at enqueue time so the flusher can route
  // disposition entries to /api/collections/{collectionId}/dispositions.
  collectionId?: string;
}

export type PendingEntry =
  | {
      kind: "decision";
      clientKey: string;
      type: "triage" | "pairwise_compare";
      decision: Record<string, unknown>;
      enqueuedAt: string;
    }
  | {
      kind: "disposition";
      clientKey: string;
      itemId: string;
      disposition: "set_aside" | "deferred" | "clear";
      enqueuedAt: string;
    };

interface Envelope {
  v: 1;
  curatorId: string;
  sessionId: string;
  collectionId?: string;
  entries: PendingEntry[];
}

const PENDING_PREFIX = "adored.pending.v1.";
const QUARANTINE_PREFIX = "adored.quarantine.v1.";
const QUARANTINE_CAP = 50;
export const GC_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — dwarfs any legitimate flush window

// Dispatched (same-document) after every successful queue write so the
// flusher's trigger hook can observe enqueues without polling; the payload is
// the pending storage key. Cross-document observation rides the Web Lock +
// re-read-under-lock in the flusher instead.
export const PENDING_CHANGED_EVENT = "adored:pending-changed";

export function newClientKey(): string {
  return ulid().toLowerCase(); // matches the shared ClientKey schema
}

export function pendingStorageKey(key: QueueKey): string {
  return `${PENDING_PREFIX}${key.curatorId}.${key.sessionId}`;
}

export function quarantineStorageKey(key: QueueKey): string {
  return `${QUARANTINE_PREFIX}${key.curatorId}.${key.sessionId}`;
}

function parseEnvelope(raw: string | null): Envelope | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const env = parsed as Partial<Envelope>;
    if (env.v !== 1) return null;
    if (typeof env.curatorId !== "string" || typeof env.sessionId !== "string") return null;
    if (!Array.isArray(env.entries)) return null;
    return env as Envelope;
  } catch {
    return null;
  }
}

function readVerifiedEnvelope(storageKey: string, key: QueueKey): Envelope | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
  const env = parseEnvelope(raw);
  if (env === null) return null;
  if (env.curatorId !== key.curatorId || env.sessionId !== key.sessionId) return null;
  return env;
}

function writeEnvelope(storageKey: string, env: Envelope): void {
  // Throws on quota — enqueue handles that; all other writers swallow below.
  window.localStorage.setItem(storageKey, JSON.stringify(env));
  try {
    window.dispatchEvent(new CustomEvent(PENDING_CHANGED_EVENT, { detail: storageKey }));
  } catch {
    // event construction can't realistically fail; never let it break a write
  }
}

export function readQueue(key: QueueKey): PendingEntry[] {
  return readVerifiedEnvelope(pendingStorageKey(key), key)?.entries ?? [];
}

export function readQueueCollectionId(key: QueueKey): string | undefined {
  const stored = readVerifiedEnvelope(pendingStorageKey(key), key)?.collectionId;
  return typeof stored === "string" ? stored : key.collectionId;
}

export type EnqueueResult = "persisted" | "needs_fallback";

export async function enqueue(
  key: QueueKey,
  entry: PendingEntry,
  onQuotaExceeded?: () => Promise<void>,
): Promise<EnqueueResult> {
  if (typeof window === "undefined") return "needs_fallback";
  const storageKey = pendingStorageKey(key);
  const build = (): Envelope => {
    const existing = readVerifiedEnvelope(storageKey, key);
    return {
      v: 1,
      curatorId: key.curatorId,
      sessionId: key.sessionId,
      collectionId: existing?.collectionId ?? key.collectionId,
      entries: [...(existing?.entries ?? []), entry],
    };
  };
  try {
    // Happy path is fully synchronous: persisted before this promise resolves.
    writeEnvelope(storageKey, build());
    return "persisted";
  } catch {
    // Quota (spec F18): shrink the queue via the injected flush, retry ONCE,
    // else the caller degrades to today's awaited direct submit.
    if (onQuotaExceeded) {
      try {
        await onQuotaExceeded();
        writeEnvelope(storageKey, build());
        return "persisted";
      } catch {
        return "needs_fallback";
      }
    }
    return "needs_fallback";
  }
}

function rewriteEntries(key: QueueKey, next: (entries: PendingEntry[]) => PendingEntry[]): boolean {
  if (typeof window === "undefined") return false;
  const storageKey = pendingStorageKey(key);
  const env = readVerifiedEnvelope(storageKey, key);
  if (env === null) return false;
  const entries = next(env.entries);
  if (entries.length === env.entries.length) return false;
  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      writeEnvelope(storageKey, { ...env, entries });
    }
    return true;
  } catch {
    return false;
  }
}

export function removeEntries(key: QueueKey, clientKeys: string[]): void {
  const drop = new Set(clientKeys);
  rewriteEntries(key, (entries) => entries.filter((e) => !drop.has(e.clientKey)));
}

export function removeQueued(key: QueueKey, clientKey: string): boolean {
  return rewriteEntries(key, (entries) => entries.filter((e) => e.clientKey !== clientKey));
}

export function quarantineEntries(key: QueueKey, entries: PendingEntry[]): void {
  if (typeof window === "undefined" || entries.length === 0) return;
  const storageKey = quarantineStorageKey(key);
  const existing = readVerifiedEnvelope(storageKey, key)?.entries ?? [];
  const kept = [...existing, ...entries].slice(-QUARANTINE_CAP); // FIFO eviction, newest kept
  try {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ v: 1, curatorId: key.curatorId, sessionId: key.sessionId, entries: kept }),
    );
  } catch {
    // quota on the quarantine shelf: these entries are terminal either way
  }
}

export function readQuarantine(key: QueueKey): PendingEntry[] {
  return readVerifiedEnvelope(quarantineStorageKey(key), key)?.entries ?? [];
}

function allStorageKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k !== null) keys.push(k);
    }
  } catch {
    // storage unavailable — nothing to list
  }
  return keys;
}

export function listPendingKeysForCurator(curatorId: string): QueueKey[] {
  if (typeof window === "undefined") return [];
  const prefix = `${PENDING_PREFIX}${curatorId}.`;
  const out: QueueKey[] = [];
  for (const storageKey of allStorageKeys()) {
    if (!storageKey.startsWith(prefix)) continue;
    const sessionId = storageKey.slice(prefix.length);
    const key: QueueKey = { curatorId, sessionId };
    const env = readVerifiedEnvelope(storageKey, key);
    if (env === null) continue; // corrupt/foreign — GC owns it, recovery ignores it
    out.push(typeof env.collectionId === "string" ? { ...key, collectionId: env.collectionId } : key);
  }
  return out;
}

export function deleteQueue(key: QueueKey): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(pendingStorageKey(key));
  } catch {
    // storage unavailable — nothing to delete
  }
}

// GC sweep (spec §3.4): every pending/quarantine key — including OTHER
// curators' and 403-stopped queues — whose NEWEST enqueuedAt is older than the
// TTL is deleted. Corrupt or empty blobs have no newest entry and sweep as
// expired (this is the promised eventual cleanup for blobs reads skip over).
export function sweepExpired(nowMs: number): void {
  if (typeof window === "undefined") return;
  const doomed: string[] = [];
  for (const storageKey of allStorageKeys()) {
    if (!storageKey.startsWith(PENDING_PREFIX) && !storageKey.startsWith(QUARANTINE_PREFIX)) continue;
    let newest = 0;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      continue;
    }
    const env = parseEnvelope(raw);
    for (const entry of env?.entries ?? []) {
      const at = Date.parse((entry as { enqueuedAt?: string }).enqueuedAt ?? "");
      if (Number.isFinite(at) && at > newest) newest = at;
    }
    if (nowMs - newest > GC_TTL_MS) doomed.push(storageKey);
  }
  for (const storageKey of doomed) {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // best-effort
    }
  }
}
