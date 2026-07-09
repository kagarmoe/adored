// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ClientKey } from "@/lib/decision-batch-schema";
import {
  GC_TTL_MS,
  PENDING_CHANGED_EVENT,
  deleteQueue,
  enqueue,
  listPendingKeysForCurator,
  newClientKey,
  pendingStorageKey,
  quarantineEntries,
  quarantineStorageKey,
  readQuarantine,
  readQueue,
  readQueueCollectionId,
  removeEntries,
  removeQueued,
  sweepExpired,
  type PendingEntry,
  type QueueKey,
} from "./decisionQueue";

const keyA: QueueKey = { curatorId: "user_a", sessionId: "sess_1", collectionId: "col_1" };
const keyB: QueueKey = { curatorId: "user_b", sessionId: "sess_1", collectionId: "col_1" };

function triageEntry(overrides: Partial<Extract<PendingEntry, { kind: "decision" }>> = {}): PendingEntry {
  return {
    kind: "decision",
    clientKey: newClientKey(),
    type: "triage",
    decision: { itemId: "item_01hzy5e8n5g3km9r2p4q6s7t8v", result: "top" },
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  };
}

function usageEntry(overrides: Partial<Extract<PendingEntry, { kind: "decision" }>> = {}): PendingEntry {
  return {
    kind: "decision",
    clientKey: newClientKey(),
    type: "usage",
    decision: { itemId: "item_01hzy5e8n5g3km9r2p4q6s7t8v", result: "uses" },
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  };
}

function dispositionEntry(overrides: Partial<Extract<PendingEntry, { kind: "disposition" }>> = {}): PendingEntry {
  return {
    kind: "disposition",
    clientKey: newClientKey(),
    itemId: "item_01hzy5e8n5g3km9r2p4q6s7t8v",
    disposition: "set_aside",
    enqueuedAt: new Date().toISOString(),
    ...overrides,
  };
}

// jsdom in this setup does not expose a working localStorage on file:// URLs —
// install the house Map-backed Storage (see round-preference.test.ts).
function installStorage(): Storage {
  const map = new Map<string, string>();
  const store: Storage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => Array.from(map.keys())[i] ?? null,
  };
  Object.defineProperty(window, "localStorage", { value: store, configurable: true });
  return store;
}

beforeEach(() => {
  installStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("newClientKey", () => {
  it("emits a lowercase Crockford ULID that satisfies the shared ClientKey schema (client/server never drift)", () => {
    const ck = newClientKey();
    expect(ck).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
    expect(ClientKey.safeParse(ck).success).toBe(true);
  });
});

describe("pendingStorageKey", () => {
  it("is the versioned curator+session key", () => {
    expect(pendingStorageKey(keyA)).toBe("adored.pending.v1.user_a.sess_1");
    expect(quarantineStorageKey(keyA)).toBe("adored.quarantine.v1.user_a.sess_1");
  });
});

describe("enqueue", () => {
  it("persists synchronously before resolving (persist-before-advance)", () => {
    const entry = triageEntry();
    const pending = enqueue(keyA, entry);
    // Assert BEFORE awaiting: the write already happened, no flush ran.
    const raw = window.localStorage.getItem(pendingStorageKey(keyA));
    expect(raw).not.toBeNull();
    expect(raw).toContain(entry.clientKey);
    return pending.then((r) => expect(r).toBe("persisted"));
  });

  it("preserves order across enqueues and stamps the envelope with collectionId", async () => {
    const e1 = triageEntry();
    const e2 = dispositionEntry();
    const e3 = triageEntry();
    await enqueue(keyA, e1);
    await enqueue(keyA, e2);
    await enqueue(keyA, e3);
    expect(readQueue(keyA).map((e) => e.clientKey)).toEqual([e1.clientKey, e2.clientKey, e3.clientKey]);
    expect(readQueueCollectionId(keyA)).toBe("col_1");
  });

  it("round-trips an enqueued usage entry through readQueue with its type preserved (ordinary decision entry)", async () => {
    const entry = usageEntry();
    await enqueue(keyA, entry);
    const [read] = readQueue(keyA);
    expect(read).toEqual(entry);
    expect(read).toMatchObject({ kind: "decision", type: "usage" });
  });

  it("dispatches a same-document change event carrying the storage key (flusher trigger seam)", async () => {
    const seen: string[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent<string>).detail);
    window.addEventListener(PENDING_CHANGED_EVENT, listener);
    await enqueue(keyA, triageEntry());
    window.removeEventListener(PENDING_CHANGED_EVENT, listener);
    expect(seen).toEqual([pendingStorageKey(keyA)]);
  });

  it("quota throw: awaits onQuotaExceeded once, retries once, and persists", async () => {
    const real = window.localStorage.setItem.bind(window.localStorage);
    let threw = false;
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation((k, v) => {
      if (!threw) {
        threw = true;
        throw new DOMException("quota", "QuotaExceededError");
      }
      real(k, v);
    });
    const onQuotaExceeded = vi.fn().mockResolvedValue(undefined);
    const entry = triageEntry();
    const result = await enqueue(keyA, entry, onQuotaExceeded);
    expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
    expect(result).toBe("persisted");
    spy.mockRestore();
    expect(readQueue(keyA).map((e) => e.clientKey)).toEqual([entry.clientKey]);
  });

  it("quota throw persisting: returns needs_fallback (caller degrades to the awaited direct submit)", async () => {
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const onQuotaExceeded = vi.fn().mockResolvedValue(undefined);
    const result = await enqueue(keyA, triageEntry(), onQuotaExceeded);
    expect(onQuotaExceeded).toHaveBeenCalledTimes(1);
    expect(result).toBe("needs_fallback");
    spy.mockRestore();
    expect(readQueue(keyA)).toEqual([]);
  });

  it("quota throw with no callback: returns needs_fallback without retrying", async () => {
    const spy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const result = await enqueue(keyA, triageEntry());
    expect(result).toBe("needs_fallback");
    spy.mockRestore();
  });
});

describe("readQueue envelope verification", () => {
  it("curator isolation: an envelope claiming another curator reads as [] and the blob is untouched", () => {
    const foreign = JSON.stringify({
      v: 1,
      curatorId: "user_a",
      sessionId: "sess_1",
      entries: [triageEntry()],
    });
    window.localStorage.setItem(pendingStorageKey(keyB), foreign);
    expect(readQueue(keyB)).toEqual([]);
    expect(window.localStorage.getItem(pendingStorageKey(keyB))).toBe(foreign);
  });

  it("corrupt JSON reads as [] without throwing and without deleting (GC owns cleanup)", () => {
    window.localStorage.setItem(pendingStorageKey(keyA), "{not json");
    expect(readQueue(keyA)).toEqual([]);
    expect(window.localStorage.getItem(pendingStorageKey(keyA))).toBe("{not json");
  });

  it("wrong envelope version reads as [] without deleting", () => {
    const v2 = JSON.stringify({ v: 2, curatorId: "user_a", sessionId: "sess_1", entries: [] });
    window.localStorage.setItem(pendingStorageKey(keyA), v2);
    expect(readQueue(keyA)).toEqual([]);
    expect(window.localStorage.getItem(pendingStorageKey(keyA))).toBe(v2);
  });
});

describe("removeEntries / removeQueued", () => {
  it("removeEntries removes exactly the given clientKeys, keeping order of the rest", async () => {
    const e1 = triageEntry();
    const e2 = triageEntry();
    const e3 = triageEntry();
    await enqueue(keyA, e1);
    await enqueue(keyA, e2);
    await enqueue(keyA, e3);
    removeEntries(keyA, [e1.clientKey, e3.clientKey]);
    expect(readQueue(keyA).map((e) => e.clientKey)).toEqual([e2.clientKey]);
  });

  it("removeQueued removes a queued entry and returns true; false for an unknown key", async () => {
    const e1 = triageEntry();
    await enqueue(keyA, e1);
    expect(removeQueued(keyA, "0123456789abcdefghjkmnpqrs")).toBe(false);
    expect(removeQueued(keyA, e1.clientKey)).toBe(true);
    expect(readQueue(keyA)).toEqual([]);
  });
});

describe("quarantine", () => {
  it("stores entries under the quarantine key and reads them back", () => {
    const e1 = triageEntry();
    quarantineEntries(keyA, [e1]);
    expect(readQuarantine(keyA).map((e) => e.clientKey)).toEqual([e1.clientKey]);
  });

  it("caps at 50 entries with FIFO eviction (55 pushed keeps the newest 50)", () => {
    const entries = Array.from({ length: 55 }, () => triageEntry());
    quarantineEntries(keyA, entries.slice(0, 30));
    quarantineEntries(keyA, entries.slice(30));
    const kept = readQuarantine(keyA);
    expect(kept).toHaveLength(50);
    expect(kept.map((e) => e.clientKey)).toEqual(entries.slice(5).map((e) => e.clientKey));
  });
});

describe("listPendingKeysForCurator / deleteQueue", () => {
  it("lists only the curator's own verified pending keys", async () => {
    await enqueue(keyA, triageEntry());
    await enqueue({ curatorId: "user_a", sessionId: "sess_2" }, triageEntry());
    await enqueue(keyB, triageEntry());
    const keys = listPendingKeysForCurator("user_a");
    expect(keys.map((k) => k.sessionId).sort()).toEqual(["sess_1", "sess_2"]);
    expect(keys.every((k) => k.curatorId === "user_a")).toBe(true);
    // collectionId round-trips from the envelope when it was stamped at enqueue time
    expect(keys.find((k) => k.sessionId === "sess_1")?.collectionId).toBe("col_1");
  });

  it("deleteQueue removes the pending key (recovery-409 disposal)", async () => {
    await enqueue(keyA, triageEntry());
    deleteQueue(keyA);
    expect(window.localStorage.getItem(pendingStorageKey(keyA))).toBeNull();
  });
});

describe("sweepExpired (GC, F18)", () => {
  it("deletes expired pending keys of OTHER curators and expired quarantine keys; keeps fresh ones", async () => {
    const now = Date.now();
    const staleIso = new Date(now - GC_TTL_MS - 24 * 60 * 60 * 1000).toISOString(); // 31 days old
    // Another curator's expired pending queue:
    window.localStorage.setItem(
      pendingStorageKey(keyB),
      JSON.stringify({
        v: 1,
        curatorId: "user_b",
        sessionId: "sess_1",
        entries: [triageEntry({ enqueuedAt: staleIso })],
      }),
    );
    // An expired quarantine key:
    window.localStorage.setItem(
      quarantineStorageKey(keyA),
      JSON.stringify({
        v: 1,
        curatorId: "user_a",
        sessionId: "sess_1",
        entries: [triageEntry({ enqueuedAt: staleIso })],
      }),
    );
    // A fresh pending queue (newest entry is fresh even though an old one exists):
    await enqueue(keyA, triageEntry({ enqueuedAt: staleIso }));
    await enqueue(keyA, triageEntry({ enqueuedAt: new Date(now).toISOString() }));
    // Unrelated storage is never touched:
    window.localStorage.setItem("pi-round-box", "10");

    sweepExpired(now);

    expect(window.localStorage.getItem(pendingStorageKey(keyB))).toBeNull();
    expect(window.localStorage.getItem(quarantineStorageKey(keyA))).toBeNull();
    expect(window.localStorage.getItem(pendingStorageKey(keyA))).not.toBeNull();
    expect(window.localStorage.getItem("pi-round-box")).toBe("10");
  });

  it("TTL is 30 days", () => {
    expect(GC_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
