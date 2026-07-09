// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { ulid } from "ulid";
import {
  enqueue,
  newClientKey,
  pendingStorageKey,
  readQuarantine,
  readQueue,
  type PendingEntry,
  type QueueKey,
} from "./decisionQueue";
import type { FlushNotice } from "./decisionFlusher";

// The engine holds module-level state (drain promises, backoff attempts, ack
// resolvers), so every test loads a FRESH instance. react and other
// node_modules are externalized, so React stays a singleton across resets.
type Engine = typeof import("./decisionFlusher");
async function loadEngine(): Promise<Engine> {
  vi.resetModules();
  return import("./decisionFlusher");
}

const keyA: QueueKey = { curatorId: "user_a", sessionId: "sess_1", collectionId: "col_1" };
const BATCH_URL = "/api/sessions/sess_1/decisions/batch";
const DISPOSITIONS_URL = "/api/collections/col_1/dispositions";

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

function triage(over: Partial<Extract<PendingEntry, { kind: "decision" }>> = {}): PendingEntry {
  return {
    kind: "decision",
    clientKey: newClientKey(),
    type: "triage",
    decision: { itemId: `item_${ulid().toLowerCase()}`, result: "top" },
    enqueuedAt: new Date().toISOString(),
    ...over,
  };
}

function setAside(over: Partial<Extract<PendingEntry, { kind: "disposition" }>> = {}): PendingEntry {
  return {
    kind: "disposition",
    clientKey: newClientKey(),
    itemId: `item_${ulid().toLowerCase()}`,
    disposition: "set_aside",
    enqueuedAt: new Date().toISOString(),
    ...over,
  };
}

function usage(over: Partial<Extract<PendingEntry, { kind: "decision" }>> = {}): PendingEntry {
  return {
    kind: "decision",
    clientKey: newClientKey(),
    type: "usage",
    decision: { itemId: `item_${ulid().toLowerCase()}`, result: "uses" },
    enqueuedAt: new Date().toISOString(),
    ...over,
  };
}

const jsonRes = (status: number, body: unknown = {}): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

function respondCreated(init: RequestInit): Response {
  const body = JSON.parse(String(init.body)) as { decisions: Array<{ clientKey: string }> };
  return jsonRes(201, {
    results: body.decisions.map((d) => ({ clientKey: d.clientKey, status: "created" })),
  });
}

type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

function installAutoFetch(): FetchMock {
  const mock = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url.includes("/decisions/batch")) return respondCreated(init);
    if (init.method === "DELETE") return jsonRes(200, { message: "Brought back" });
    return jsonRes(201);
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function batchBodyKeys(init: RequestInit | undefined): string[] {
  const body = JSON.parse(String(init?.body)) as { decisions: Array<{ clientKey: string }> };
  return body.decisions.map((d) => d.clientKey);
}

async function microtasks(turns = 30) {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

beforeEach(() => {
  installStorage();
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window.navigator, "locks");
});

describe("drain — ordering", () => {
  it("flushes [triage A, set_aside B, triage C] as batch(1) → disposition POST → batch(1), in order", async () => {
    const engine = await loadEngine();
    const fetchMock = installAutoFetch();
    const a = triage();
    const b = setAside();
    const c = triage();
    await enqueue(keyA, a);
    await enqueue(keyA, b);
    await enqueue(keyA, c);

    await engine.drain([keyA]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(BATCH_URL);
    expect(batchBodyKeys(fetchMock.mock.calls[0][1])).toEqual([a.clientKey]);
    expect(fetchMock.mock.calls[1][0]).toBe(DISPOSITIONS_URL);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      itemId: (b as { itemId: string }).itemId,
      disposition: "set_aside",
    });
    expect(fetchMock.mock.calls[2][0]).toBe(BATCH_URL);
    expect(batchBodyKeys(fetchMock.mock.calls[2][1])).toEqual([c.clientKey]);
    expect(readQueue(keyA)).toEqual([]);
  });

  it("flushes [usage, triage, set_aside, usage] as batch(2) → disposition POST → batch(1), usage riding contiguous decision runs verbatim (spec §5)", async () => {
    const engine = await loadEngine();
    const fetchMock = installAutoFetch();
    const u1 = usage();
    const t = triage();
    const s = setAside();
    const u2 = usage();
    await enqueue(keyA, u1);
    await enqueue(keyA, t);
    await enqueue(keyA, s);
    await enqueue(keyA, u2);

    await engine.drain([keyA]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // First contiguous decision run: usage + triage batched together, order kept.
    expect(fetchMock.mock.calls[0][0]).toBe(BATCH_URL);
    expect(batchBodyKeys(fetchMock.mock.calls[0][1])).toEqual([u1.clientKey, t.clientKey]);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as {
      decisions: Array<{ type: string }>;
    };
    // The usage type flows verbatim into the batch body — no rewrite, no coercion.
    expect(firstBody.decisions.map((d) => d.type)).toEqual(["usage", "triage"]);
    // The disposition breaks the run and flushes alone.
    expect(fetchMock.mock.calls[1][0]).toBe(DISPOSITIONS_URL);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      itemId: (s as { itemId: string }).itemId,
      disposition: "set_aside",
    });
    // Second run: the trailing usage entry alone.
    expect(fetchMock.mock.calls[2][0]).toBe(BATCH_URL);
    expect(batchBodyKeys(fetchMock.mock.calls[2][1])).toEqual([u2.clientKey]);
    expect(readQueue(keyA)).toEqual([]);
  });

  it("preserves cross-endpoint order: [set_aside X, triage X] lands in that order", async () => {
    const engine = await loadEngine();
    const fetchMock = installAutoFetch();
    const itemId = `item_${ulid().toLowerCase()}`;
    await enqueue(keyA, setAside({ itemId }));
    await enqueue(keyA, triage({ decision: { itemId, result: "top" } }));

    await engine.drain([keyA]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(DISPOSITIONS_URL);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[1][0]).toBe(BATCH_URL);
  });

  it("chunks 120 decisions into sequential 50/50/20 batches, acking exactly the acked clientKeys", async () => {
    const engine = await loadEngine();
    const entries = Array.from({ length: 120 }, () => triage());
    for (const e of entries) await enqueue(keyA, e);
    const keys = entries.map((e) => e.clientKey);

    const pendingFetches: Array<{ init: RequestInit; resolve: (r: Response) => void }> = [];
    global.fetch = vi.fn(
      (_url: string, init: RequestInit = {}) =>
        new Promise<Response>((resolve) => pendingFetches.push({ init, resolve })),
    ) as unknown as typeof fetch;

    const done = engine.drain([keyA]);

    await vi.waitFor(() => expect(pendingFetches).toHaveLength(1));
    expect(batchBodyKeys(pendingFetches[0].init)).toEqual(keys.slice(0, 50));
    pendingFetches[0].resolve(respondCreated(pendingFetches[0].init));

    await vi.waitFor(() => expect(pendingFetches).toHaveLength(2));
    // Exactly the first 50 were removed — nothing more, nothing less.
    expect(readQueue(keyA).map((e) => e.clientKey)).toEqual(keys.slice(50));
    expect(batchBodyKeys(pendingFetches[1].init)).toEqual(keys.slice(50, 100));
    pendingFetches[1].resolve(respondCreated(pendingFetches[1].init));

    await vi.waitFor(() => expect(pendingFetches).toHaveLength(3));
    expect(batchBodyKeys(pendingFetches[2].init)).toEqual(keys.slice(100));
    pendingFetches[2].resolve(respondCreated(pendingFetches[2].init));

    await done;
    expect(readQueue(keyA)).toEqual([]);
  });

  it("rehydration: a queue written directly to localStorage (reload — no in-memory state) drains in stored order", async () => {
    const engine = await loadEngine();
    const fetchMock = installAutoFetch();
    const e1 = triage();
    const e2 = triage();
    window.localStorage.setItem(
      pendingStorageKey(keyA),
      JSON.stringify({
        v: 1,
        curatorId: keyA.curatorId,
        sessionId: keyA.sessionId,
        collectionId: keyA.collectionId,
        entries: [e1, e2],
      }),
    );

    await engine.drain([keyA]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(batchBodyKeys(fetchMock.mock.calls[0][1])).toEqual([e1.clientKey, e2.clientKey]);
    expect(readQueue(keyA)).toEqual([]);
  });
});

describe("drain — single-flight (F12)", () => {
  it("a second drain() during an in-flight drain returns the SAME promise; a 4 s timer mid-flight starts no second flush", async () => {
    vi.useFakeTimers();
    const engine = await loadEngine();
    let resolveFetch!: (r: Response) => void;
    let capturedInit: RequestInit = {};
    global.fetch = vi.fn(
      (_url: string, init: RequestInit = {}) =>
        new Promise<Response>((resolve) => {
          capturedInit = init;
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;
    const fetchMock = global.fetch as unknown as FetchMock;

    renderHook(() => engine.useDecisionFlusher(keyA));
    await enqueue(keyA, triage()); // schedules the 4 s timer via the change event

    const p1 = engine.drain([keyA]);
    const p2 = engine.drain([keyA]);
    expect(p2).toBe(p1);
    const p3 = engine.triggerFlush(keyA);
    expect(p3).toBe(p1);

    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The 4 s trigger fires mid-flight — must NOT start a second flush.
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(respondCreated(capturedInit));
    await p1;
    expect(fetchMock).toHaveBeenCalledTimes(1); // one POST total for one pending entry
    expect(readQueue(keyA)).toEqual([]);
  });
});

describe("drain — backoff (F15)", () => {
  it("5xx retries at exactly 1 s, 4 s, 15 s, then 60 s repeated (cap); success resets; queue intact throughout", async () => {
    vi.useFakeTimers();
    const engine = await loadEngine();
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit = {}) => jsonRes(500));
    global.fetch = fetchMock as unknown as typeof fetch;

    await enqueue(keyA, triage());
    const done = engine.drain([keyA]);
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // t = 1 s
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); // + 4 s
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(15000); // + 15 s
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(60000); // + 60 s (cap)
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(5);

    await vi.advanceTimersByTimeAsync(60000); // cap repeats
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(6);

    expect(readQueue(keyA)).toHaveLength(1); // queue intact through every failure

    // A success resets the schedule and lets the drain settle.
    fetchMock.mockImplementation(async (_url: string, init: RequestInit = {}) => respondCreated(init));
    await vi.advanceTimersByTimeAsync(60000);
    await microtasks();
    await done;
    expect(readQueue(keyA)).toEqual([]);

    // Fresh failure (network throw) starts back at 1 s — the schedule was reset.
    fetchMock.mockImplementation(async () => {
      throw new TypeError("network down");
    });
    await enqueue(keyA, triage());
    const done2 = engine.drain([keyA]);
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(1000);
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(9);
    fetchMock.mockImplementation(async (_url: string, init: RequestInit = {}) => respondCreated(init));
    await vi.advanceTimersByTimeAsync(4000);
    await microtasks();
    await done2;
  });

  it("pagehide preempts an active backoff wait with an immediate keepalive fetch (F11)", async () => {
    vi.useFakeTimers();
    const engine = await loadEngine();
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit = {}) => jsonRes(500));
    global.fetch = fetchMock as unknown as typeof fetch;

    renderHook(() => engine.useDecisionFlusher(keyA));
    await enqueue(keyA, triage());
    void engine.triggerFlush(keyA);
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // In the 1 s backoff wait now. No timer advance — pagehide must preempt.
    window.dispatchEvent(new Event("pagehide"));
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.keepalive).toBe(true);
  });
});

describe("drain — cross-tab exclusion via Web Locks (F11)", () => {
  class FakeLocks {
    log: string[] = [];
    private tails = new Map<string, Promise<void>>();
    request = (name: string, cb: (lock: { name: string }) => Promise<unknown>): Promise<unknown> => {
      const prev = this.tails.get(name) ?? Promise.resolve();
      let done!: () => void;
      const gate = new Promise<void>((r) => (done = r));
      this.tails.set(
        name,
        prev.then(() => gate),
      );
      return prev.then(async () => {
        this.log.push("grant");
        try {
          return await cb({ name });
        } finally {
          this.log.push("release");
          done();
        }
      });
    };
  }

  it("two realms never hold the lock at once, and an enqueue during the other realm's ack-removal is not lost", async () => {
    const locks = new FakeLocks();
    Object.defineProperty(window.navigator, "locks", { value: locks, configurable: true });

    const m1 = await loadEngine();
    const m2 = await loadEngine(); // second realm: fresh module state, shared storage + locks

    const pendingFetches: Array<{ init: RequestInit; resolve: (r: Response) => void }> = [];
    global.fetch = vi.fn(
      (_url: string, init: RequestInit = {}) =>
        new Promise<Response>((resolve) => pendingFetches.push({ init, resolve })),
    ) as unknown as typeof fetch;

    const e1 = triage();
    await enqueue(keyA, e1);

    const p1 = m1.drain([keyA]);
    const p2 = m2.drain([keyA]);

    await vi.waitFor(() => expect(pendingFetches).toHaveLength(1));
    // Realm 1 holds the lock mid-request; realm 2 must be blocked, not fetching.
    expect(pendingFetches).toHaveLength(1);

    // Interleaved enqueue BEFORE realm 1's ack-removal runs: must not be lost.
    const e2 = triage();
    await enqueue(keyA, e2);

    pendingFetches[0].resolve(respondCreated(pendingFetches[0].init));

    await vi.waitFor(() => expect(pendingFetches).toHaveLength(2));
    expect(batchBodyKeys(pendingFetches[1].init)).toEqual([e2.clientKey]);
    pendingFetches[1].resolve(respondCreated(pendingFetches[1].init));

    await Promise.all([p1, p2]);
    expect(readQueue(keyA)).toEqual([]);

    // Grant log proves mutual exclusion: never two grants without a release between.
    let depth = 0;
    for (const evt of locks.log) {
      depth += evt === "grant" ? 1 : -1;
      expect(depth).toBeLessThanOrEqual(1);
      expect(depth).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("drain — failure taxonomy", () => {
  it("disposition 409: that entry removed, ONE disposition_superseded notice, drain continues — the following triage still lands (F4)", async () => {
    const engine = await loadEngine();
    const notices: FlushNotice[] = [];
    engine.subscribeNotices((n) => notices.push(n));
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes("/decisions/batch")) return respondCreated(init);
      return jsonRes(409, { error: "already triaged" });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const x = setAside();
    const y = triage();
    await enqueue(keyA, x);
    await enqueue(keyA, y);

    await engine.drain([keyA]);

    expect(notices.filter((n) => n.kind === "disposition_superseded")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(BATCH_URL);
    expect(batchBodyKeys(fetchMock.mock.calls[1][1])).toEqual([y.clientKey]);
    expect(readQueue(keyA)).toEqual([]); // X removed, Y acked — never discarded
  });

  it("disposition 404: silent drop, drain continues", async () => {
    const engine = await loadEngine();
    const notices: FlushNotice[] = [];
    engine.subscribeNotices((n) => notices.push(n));
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes("/decisions/batch")) return respondCreated(init);
      return jsonRes(404);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await enqueue(keyA, setAside());
    const y = triage();
    await enqueue(keyA, y);

    await engine.drain([keyA]);

    expect(notices).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readQueue(keyA)).toEqual([]);
  });

  it("a stale-shape entry is quarantined pre-flight (shared Zod schema); the rest are POSTed and acked; one quarantined notice", async () => {
    const engine = await loadEngine();
    const notices: FlushNotice[] = [];
    engine.subscribeNotices((n) => notices.push(n));
    const fetchMock = installAutoFetch();

    const stale = triage({ decision: { itemId: `item_${ulid().toLowerCase()}`, result: "loved" } });
    const valid = triage();
    await enqueue(keyA, stale);
    await enqueue(keyA, valid);

    await engine.drain([keyA]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(batchBodyKeys(fetchMock.mock.calls[0][1])).toEqual([valid.clientKey]); // offender never sent
    expect(readQuarantine(keyA).map((e) => e.clientKey)).toEqual([stale.clientKey]);
    expect(readQueue(keyA)).toEqual([]);
    expect(notices.filter((n) => n.kind === "quarantined")).toEqual([{ kind: "quarantined", count: 1 }]);
  });

  it("server 400 on a locally-valid chunk (deploy skew): chunk quarantined — never a hot retry loop", async () => {
    const engine = await loadEngine();
    const notices: FlushNotice[] = [];
    engine.subscribeNotices((n) => notices.push(n));
    const fetchMock = vi.fn(async () => jsonRes(400, { error: "Invalid request" }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const e1 = triage();
    const e2 = triage();
    await enqueue(keyA, e1);
    await enqueue(keyA, e2);

    await engine.drain([keyA]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readQuarantine(keyA).map((e) => e.clientKey)).toEqual([e1.clientKey, e2.clientKey]);
    expect(readQueue(keyA)).toEqual([]);
    expect(notices.filter((n) => n.kind === "quarantined")).toEqual([{ kind: "quarantined", count: 2 }]);
  });

  it("401: queue preserved, drain stops, one auth_required notice", async () => {
    const engine = await loadEngine();
    const notices: FlushNotice[] = [];
    engine.subscribeNotices((n) => notices.push(n));
    global.fetch = vi.fn(async () => jsonRes(401)) as unknown as typeof fetch;

    const e1 = triage();
    await enqueue(keyA, e1);
    await engine.drain([keyA]); // resolves: the taxonomy said stop

    expect(readQueue(keyA).map((e) => e.clientKey)).toEqual([e1.clientKey]);
    expect(notices).toEqual([{ kind: "auth_required" }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("403: queue preserved and stopped — storage intact, never deleted live", async () => {
    const engine = await loadEngine();
    const notices: FlushNotice[] = [];
    engine.subscribeNotices((n) => notices.push(n));
    global.fetch = vi.fn(async () => jsonRes(403)) as unknown as typeof fetch;

    await enqueue(keyA, triage());
    await engine.drain([keyA]);

    expect(window.localStorage.getItem(pendingStorageKey(keyA))).not.toBeNull();
    expect(readQueue(keyA)).toHaveLength(1);
    expect(notices).toEqual([]);
  });

  it("batch 409 mid-round (no recovery): stop + preserve + one session_conflict notice", async () => {
    const engine = await loadEngine();
    const notices: FlushNotice[] = [];
    engine.subscribeNotices((n) => notices.push(n));
    global.fetch = vi.fn(async () => jsonRes(409)) as unknown as typeof fetch;

    await enqueue(keyA, triage());
    await engine.drain([keyA]);

    expect(notices).toEqual([{ kind: "session_conflict" }]);
    expect(readQueue(keyA)).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("batch 409 during recovery: one session_conflict surface, then the queue is deleted (terminal-session disposal)", async () => {
    const engine = await loadEngine();
    const notices: FlushNotice[] = [];
    engine.subscribeNotices((n) => notices.push(n));
    global.fetch = vi.fn(async () => jsonRes(409)) as unknown as typeof fetch;

    await enqueue(keyA, triage());
    await engine.drain([keyA], { recovery: true });

    expect(notices).toEqual([{ kind: "session_conflict" }]);
    expect(window.localStorage.getItem(pendingStorageKey(keyA))).toBeNull();
  });

  it("rejected acks: entry removed, one rejected_unknown_item notice per drain with the count", async () => {
    const engine = await loadEngine();
    const notices: FlushNotice[] = [];
    engine.subscribeNotices((n) => notices.push(n));
    global.fetch = vi.fn(async (_url: string, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body)) as { decisions: Array<{ clientKey: string }> };
      return jsonRes(201, {
        results: body.decisions.map((d, i) => ({
          clientKey: d.clientKey,
          status: i === 0 ? "rejected" : "created",
          ...(i === 0 ? { reason: "unknown_item" } : {}),
        })),
      });
    }) as unknown as typeof fetch;

    await enqueue(keyA, triage());
    await enqueue(keyA, triage());
    await engine.drain([keyA]);

    expect(readQueue(keyA)).toEqual([]);
    expect(notices.filter((n) => n.kind === "rejected_unknown_item")).toEqual([
      { kind: "rejected_unknown_item", count: 1 },
    ]);
  });
});

describe("triggers — useDecisionFlusher", () => {
  it("the 5th enqueue triggers a drain immediately (≥5 pending)", async () => {
    vi.useFakeTimers();
    const engine = await loadEngine();
    const fetchMock = installAutoFetch();
    renderHook(() => engine.useDecisionFlusher(keyA));

    for (let i = 0; i < 4; i++) await enqueue(keyA, triage());
    await microtasks();
    expect(fetchMock).not.toHaveBeenCalled();

    await enqueue(keyA, triage());
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(batchBodyKeys(fetchMock.mock.calls[0][1])).toHaveLength(5);
  });

  it("a lone entry drains 4 s after enqueue", async () => {
    vi.useFakeTimers();
    const engine = await loadEngine();
    const fetchMock = installAutoFetch();
    renderHook(() => engine.useDecisionFlusher(keyA));

    await enqueue(keyA, triage());
    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await microtasks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pins the trigger thresholds and the backoff schedule", async () => {
    const engine = await loadEngine();
    expect(engine.FLUSH_PENDING_THRESHOLD).toBe(5);
    expect(engine.FLUSH_AFTER_OLDEST_MS).toBe(4000);
    expect([...engine.BACKOFF_MS]).toEqual([1000, 4000, 15000, 60000]);
  });
});

describe("awaitAck", () => {
  it("resolves with created for an acked entry", async () => {
    const engine = await loadEngine();
    installAutoFetch();
    const e = triage();
    await enqueue(keyA, e);

    const ack = engine.awaitAck(keyA, e.clientKey);
    await engine.triggerFlush(keyA);
    await expect(ack).resolves.toEqual({ status: "created" });
  });

  it("resolves with rejected (and the reason) for a rejected entry", async () => {
    const engine = await loadEngine();
    global.fetch = vi.fn(async (_url: string, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body)) as { decisions: Array<{ clientKey: string }> };
      return jsonRes(201, {
        results: body.decisions.map((d) => ({
          clientKey: d.clientKey,
          status: "rejected",
          reason: "unknown_item",
        })),
      });
    }) as unknown as typeof fetch;
    const e = triage();
    await enqueue(keyA, e);

    const ack = engine.awaitAck(keyA, e.clientKey);
    await engine.triggerFlush(keyA);
    await expect(ack).resolves.toEqual({ status: "rejected", reason: "unknown_item" });
  });

  it("an ack that landed before awaitAck was called still resolves (recent-outcome buffer)", async () => {
    const engine = await loadEngine();
    installAutoFetch();
    const e = triage();
    await enqueue(keyA, e);
    await engine.triggerFlush(keyA); // ack already landed
    await expect(engine.awaitAck(keyA, e.clientKey)).resolves.toEqual({ status: "created" });
  });
});

describe("isInFlight (undo-as-revisit introspection, F19)", () => {
  it("reports an entry inside an active POST and clears once the ack lands", async () => {
    const engine = await loadEngine();
    const e = triage();
    await enqueue(keyA, e);
    expect(engine.isInFlight(keyA, e.clientKey)).toBe(false); // queued, not sent

    let release!: () => void;
    global.fetch = vi.fn(
      (url: string, init: RequestInit = {}) =>
        new Promise<Response>((resolve) => {
          release = () => resolve(respondCreated(init));
        }),
    ) as unknown as typeof fetch;

    const drainP = engine.drain([keyA]);
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(engine.isInFlight(keyA, e.clientKey)).toBe(true);

    release();
    await drainP;
    expect(engine.isInFlight(keyA, e.clientKey)).toBe(false);
    expect(readQueue(keyA)).toEqual([]);
  });

  it("a network failure returns the entry to queued (not in flight) while it awaits backoff", async () => {
    vi.useFakeTimers();
    const engine = await loadEngine();
    const e = triage();
    await enqueue(keyA, e);
    global.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;

    const drainP = engine.drain([keyA]);
    await microtasks();
    expect(engine.isInFlight(keyA, e.clientKey)).toBe(false); // preserved, awaiting retry
    expect(readQueue(keyA)).toHaveLength(1);

    installAutoFetch();
    await vi.advanceTimersByTimeAsync(1_000); // first backoff step
    await drainP;
    expect(readQueue(keyA)).toEqual([]);
  });
});
