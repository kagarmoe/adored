// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ulid } from "ulid";
import {
  PendingDecisionsGate,
  GATE_CATCHUP_LINE,
  GATE_REVEAL_BOUND_MS,
} from "./PendingDecisionsGate";
import {
  AUTH_REQUIRED_NOTICE,
  CLOSED_SESSION_DISCARDED_NOTICE,
  PendingNotices,
  SESSION_CONFLICT_NOTICE,
} from "./pendingNotices";
import {
  GC_TTL_MS,
  enqueue,
  newClientKey,
  pendingStorageKey,
  readQueue,
  type PendingEntry,
  type QueueKey,
} from "./decisionQueue";
import { dismissNotice, drain, getNoticeSet, triggerFlush } from "./decisionFlusher";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/collections/c1/sort",
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

// Entries must pass the SHARED batch schema at flush time — repository-format ids.
function triage(): PendingEntry {
  return {
    kind: "decision",
    clientKey: newClientKey(),
    type: "triage",
    decision: { itemId: `item_${ulid().toLowerCase()}`, result: "top" },
    enqueuedAt: new Date().toISOString(),
  };
}

const jsonRes = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

function respondCreated(init: RequestInit): Response {
  const body = JSON.parse(String(init.body)) as { decisions: Array<{ clientKey: string }> };
  return jsonRes(201, {
    results: body.decisions.map((d) => ({ clientKey: d.clientKey, status: "created" })),
  });
}

// The module-level engine keeps per-storage-key state — one session per test.
let seq = 0;
let key: QueueKey;

beforeEach(() => {
  vi.clearAllMocks();
  installStorage();
  key = { curatorId: "u1", sessionId: `sess_gate_${++seq}`, collectionId: "coll_1" };
});

afterEach(() => {
  cleanup();
  // Engine notices are sticky and module-level: never let one leak into the next test.
  for (const notice of getNoticeSet()) dismissNotice(notice);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function gate(curatorId = "u1") {
  return render(
    <PendingDecisionsGate curatorId={curatorId} collectionId="coll_1">
      <PendingNotices collectionId="coll_1" />
      <div data-testid="content">the surface</div>
    </PendingDecisionsGate>,
  );
}

describe("PendingDecisionsGate", () => {
  it("empty queue → children render synchronously, no drain, no refresh", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    gate();

    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("children stay UNMOUNTED (absent from the DOM) until the last ack, then mount after the refresh transition settles", async () => {
    let release: ((r: Response) => void) | undefined;
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          release = () => resolve(respondCreated(init));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await enqueue(key, triage());

    gate();

    // Recovery in progress: children absent (conditional mount, never CSS-hide).
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      release?.(undefined as never);
    });

    await waitFor(() => expect(screen.getByTestId("content")).toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(readQueue(key)).toHaveLength(0); // acked entries removed
  });

  it("bounded reveal (F8): after ~5 s without acks children mount with the catch-up line, queue intact; the final ack still runs ONE refresh", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          release = () => resolve(respondCreated(init));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await enqueue(key, triage());

    gate();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(GATE_REVEAL_BOUND_MS);
    });

    // Availability beats the ordering guarantee after the bound: reveal with the
    // quiet catch-up line, background flush continuing, queue intact.
    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(screen.getByText(GATE_CATCHUP_LINE)).toBeInTheDocument();
    expect(readQueue(key)).toHaveLength(1);
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      release?.();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(refresh).toHaveBeenCalledTimes(1); // one refresh on final ack
    expect(readQueue(key)).toHaveLength(0);
    expect(screen.queryByText(GATE_CATCHUP_LINE)).not.toBeInTheDocument();
  });

  it("mounting during a hook-initiated drain awaits the SAME promise — no second POST (F12)", async () => {
    let release: ((r: Response) => void) | undefined;
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve) => {
          release = () => resolve(respondCreated(init));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await enqueue(key, triage());
    const hookDrain = triggerFlush(key); // a trigger-hook drain already in flight
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    gate();
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();

    await act(async () => {
      release?.(undefined as never);
      await hookDrain;
    });

    await waitFor(() => expect(screen.getByTestId("content")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1); // never a second POST
  });

  it("401 during the recovery drain → reveal once the drain stops, with the re-auth affordance, queue preserved, no refresh", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(401)));
    await enqueue(key, triage());

    gate();

    await waitFor(() => expect(screen.getByTestId("content")).toBeInTheDocument());
    expect(screen.getAllByText(AUTH_REQUIRED_NOTICE)).toHaveLength(1);
    // A second 401 after reveal still shows ONE line.
    await act(async () => {
      await triggerFlush(key);
    });
    expect(screen.getAllByText(AUTH_REQUIRED_NOTICE)).toHaveLength(1);
    expect(readQueue(key)).toHaveLength(1); // preserved across re-login
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a sign-in notice left over from an earlier drain never skips the refresh after a recovery that lands", async () => {
    const earlier: QueueKey = { ...key, sessionId: `${key.sessionId}_earlier` };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(401)));
    await enqueue(earlier, triage());
    await drain([earlier]); // auth_required now stands in the engine
    window.localStorage.removeItem(pendingStorageKey(earlier));
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => Promise.resolve(respondCreated(init))));
    await enqueue(key, triage());

    gate();

    await waitFor(() => expect(screen.getByTestId("content")).toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(readQueue(key)).toHaveLength(0);
  });

  it("stale sign-in line + recovery 409 still refreshes", async () => {
    // A sign-in line from an earlier drain is not this recovery's answer: the 409 lets the closed
    // sort's answers go (non-2xx, so nothing clears the old line), and the surface must still refresh.
    const earlier: QueueKey = { ...key, sessionId: `${key.sessionId}_earlier` };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(401)));
    await enqueue(earlier, triage());
    await drain([earlier]); // auth_required now stands in the engine
    window.localStorage.removeItem(pendingStorageKey(earlier));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(409)));
    await enqueue(key, triage());

    gate();

    await waitFor(() => expect(screen.getByTestId("content")).toBeInTheDocument());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(pendingStorageKey(key))).toBeNull();
    expect(screen.getAllByText(CLOSED_SESSION_DISCARDED_NOTICE)).toHaveLength(1);
  });

  it("recovery-409 → the discarded answers are told (ONE line, any surface), terminal queue deleted, Okay removes it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonRes(409)));
    await enqueue(key, triage());

    gate();

    await waitFor(() => expect(screen.getByTestId("content")).toBeInTheDocument());
    // The surface's PendingNotices (this collection, no sort) still tells the person.
    expect(screen.getAllByText(CLOSED_SESSION_DISCARDED_NOTICE)).toHaveLength(1);
    expect(screen.queryByText(SESSION_CONFLICT_NOTICE)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(pendingStorageKey(key))).toBeNull(); // disposed, not preserved

    fireEvent.click(screen.getByRole("button", { name: "Okay" }));
    expect(screen.queryByText(CLOSED_SESSION_DISCARDED_NOTICE)).not.toBeInTheDocument();
  });

  it("cross-curator isolation: curator B's mount leaves curator A's queue untouched and drains nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const foreign: QueueKey = { curatorId: "uA", sessionId: "sess_foreign", collectionId: "coll_1" };
    await enqueue(foreign, triage());
    const blob = window.localStorage.getItem(pendingStorageKey(foreign));

    gate("uB");

    expect(screen.getByTestId("content")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(pendingStorageKey(foreign))).toBe(blob);
  });

  it("GC (F18): an EXPIRED foreign pending key is removed on mount; a fresh one is kept", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const expiredKey = "adored.pending.v1.uOld.sess_old";
    window.localStorage.setItem(
      expiredKey,
      JSON.stringify({
        v: 1,
        curatorId: "uOld",
        sessionId: "sess_old",
        entries: [
          { ...triage(), enqueuedAt: new Date(Date.now() - GC_TTL_MS - 24 * 60 * 60 * 1000).toISOString() },
        ],
      }),
    );
    const fresh: QueueKey = { curatorId: "uFresh", sessionId: "sess_fresh", collectionId: "coll_1" };
    await enqueue(fresh, triage());

    gate("uB"); // uB has nothing pending — the sweep still runs

    await waitFor(() => expect(window.localStorage.getItem(expiredKey)).toBeNull());
    expect(window.localStorage.getItem(pendingStorageKey(fresh))).not.toBeNull();
  });
});
