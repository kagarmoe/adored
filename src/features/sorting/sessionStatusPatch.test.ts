// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ulid } from "ulid";
import {
  PAUSE_PREFLUSH_BOUND_MS,
  patchSessionStatus,
} from "./sessionStatusPatch";
import { enqueue, newClientKey, readQueue, type PendingEntry, type QueueKey } from "./decisionQueue";
import { drain, triggerFlush } from "./decisionFlusher";

// The helper's contract is about SEQUENCING against the flush engine — mock the
// engine, keep the queue real (the terminal branch reads it back).
vi.mock("./decisionFlusher", () => ({
  drain: vi.fn().mockResolvedValue(undefined),
  triggerFlush: vi.fn().mockResolvedValue(undefined),
}));

// jsdom in this setup does not expose a working localStorage on file:// URLs —
// install the house Map-backed Storage (see decisionQueue.test.ts).
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

function triage(): PendingEntry {
  return {
    kind: "decision",
    clientKey: newClientKey(),
    type: "triage",
    decision: { itemId: `item_${ulid().toLowerCase()}`, result: "top" },
    enqueuedAt: new Date().toISOString(),
  };
}

let seq = 0;
let key: QueueKey;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  installStorage();
  key = { curatorId: "u1", sessionId: `sess_patch_${++seq}`, collectionId: "coll_1" };
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(drain).mockResolvedValue(undefined);
  vi.mocked(triggerFlush).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function patchCall(call = 0) {
  const [url, init] = fetchMock.mock.calls[call];
  return { url, method: init.method, body: init.body ? JSON.parse(init.body as string) : undefined };
}

describe("patchSessionStatus — paused (best-effort bounded pre-flush, F8)", () => {
  it("a failing/backing-off pre-flush still PATCHes {status:'paused'} after the bound; the queue is preserved", async () => {
    vi.useFakeTimers();
    vi.mocked(triggerFlush).mockReturnValue(new Promise(() => {})); // backing off forever
    await enqueue(key, triage());

    const patched = patchSessionStatus(key, "paused");
    await vi.advanceTimersByTimeAsync(PAUSE_PREFLUSH_BOUND_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled(); // still inside the bound
    await vi.advanceTimersByTimeAsync(1);
    await patched;

    expect(patchCall()).toEqual({
      url: `/api/sessions/${key.sessionId}`,
      method: "PATCH",
      body: { status: "paused" },
    });
    expect(readQueue(key)).toHaveLength(1); // the gate recovers it on return
  });

  it("with a healthy queue the flush is triggered BEFORE the PATCH (call order)", async () => {
    await patchSessionStatus(key, "paused");

    expect(vi.mocked(triggerFlush)).toHaveBeenCalledWith(key);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(triggerFlush).mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    );
    expect(patchCall().body).toEqual({ status: "paused" });
  });

  it("a pre-flush rejection is swallowed — pausing is never gated on the network", async () => {
    vi.mocked(triggerFlush).mockRejectedValue(new Error("offline"));

    const res = await patchSessionStatus(key, "paused");

    expect(res.ok).toBe(true);
    expect(patchCall().body).toEqual({ status: "paused" });
  });
});

describe("patchSessionStatus — terminal (strict flush-then-complete, parent ARCH-2)", () => {
  it("completed AWAITS the drain: the PATCH is not issued until the drain resolves", async () => {
    let release: (() => void) | undefined;
    vi.mocked(drain).mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    const patched = patchSessionStatus(key, "completed");
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled(); // no terminal PATCH while entries could be pending

    release?.();
    await patched;

    expect(vi.mocked(drain)).toHaveBeenCalledWith([key]);
    expect(patchCall()).toEqual({
      url: `/api/sessions/${key.sessionId}`,
      method: "PATCH",
      body: { status: "completed" },
    });
  });

  it("a taxonomy-stopped drain (entries left behind) → NO PATCH, the failure surfaces to the caller", async () => {
    await enqueue(key, triage()); // the drain 'resolves' but preserved this entry (401/403/409/…)

    await expect(patchSessionStatus(key, "completed")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readQueue(key)).toHaveLength(1); // still preserved for recovery
  });

  it("abandoned takes the same strict branch", async () => {
    await patchSessionStatus(key, "abandoned");

    expect(vi.mocked(drain)).toHaveBeenCalledWith([key]);
    expect(patchCall().body).toEqual({ status: "abandoned" });
  });
});

describe("patchSessionStatus — active (resume)", () => {
  it("issues the PATCH with no drain and no flush trigger", async () => {
    await patchSessionStatus(key, "active");

    expect(vi.mocked(drain)).not.toHaveBeenCalled();
    expect(vi.mocked(triggerFlush)).not.toHaveBeenCalled();
    expect(patchCall()).toEqual({
      url: `/api/sessions/${key.sessionId}`,
      method: "PATCH",
      body: { status: "active" },
    });
  });
});
