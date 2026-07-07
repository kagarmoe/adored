// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Item } from "@/types";
import { readQueue, removeEntries, type QueueKey } from "./decisionQueue";
import { TriageRound, type TriageRoundQueueEntry } from "./TriageRound";
import { TriageUndoProvider } from "./TriageUndoProvider";

const { refresh, push } = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

// The flusher is mocked wherever the assertion is about call counts / ordering;
// the queue module stays REAL so persist-before-advance is asserted against
// actual localStorage writes.
const flusher = vi.hoisted(() => ({
  triggerFlush: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  drain: vi.fn(() => Promise.resolve()),
  useDecisionFlusher: vi.fn(),
  subscribeNotices: vi.fn(() => () => {}),
  awaitAck: vi.fn(() => new Promise(() => {})),
  isInFlight: vi.fn(() => false),
}));
vi.mock("./decisionFlusher", () => flusher);

// jsdom in this setup does not expose a working localStorage on file:// URLs —
// install the house Map-backed Storage (see decisionFlusher.test.ts).
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

const item = (id: string, name: string): Item =>
  ({ id, collectionId: "coll_1", name, brand: null, style: null, color: null, material: null, category: null, number: null, height: null, width: null, depth: null, weight: null, unit: "imperial", status: null, notes: null, createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null }) as Item;

const entry = (id: string, name: string, deferred = false): TriageRoundQueueEntry => ({
  item: item(id, name),
  deferred,
  heroPhotoUrl: `/photos/${id}.jpg`,
});

const KEY: QueueKey = { curatorId: "u1", sessionId: "sess_1", collectionId: "coll_1" };

function renderRound(over: Partial<Parameters<typeof TriageRound>[0]> = {}) {
  const props = {
    curatorId: "u1",
    sessionId: "sess_1",
    collectionId: "coll_1",
    collectionSlugOrId: "summer-bags",
    queue: [entry("item_a", "Bag A"), entry("item_b", "Bag B")],
    decisions: [],
    decidedSeed: 0,
    hubHref: "/hub",
    setAsideHref: "/set-aside",
    ...over,
  };
  return render(<TriageRound {...props} />);
}

let store: Storage;

beforeEach(() => {
  vi.clearAllMocks();
  flusher.triggerFlush.mockImplementation(() => Promise.resolve());
  flusher.awaitAck.mockImplementation(() => new Promise(() => {}));
  flusher.isInFlight.mockReturnValue(false);
  store = installStorage();
  global.fetch = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) })) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TriageRound optimistic advance (F15)", () => {
  it("n taps advance through n items with ZERO refresh; each tap is persisted before the next item renders", async () => {
    const user = userEvent.setup();
    renderRound({ queue: [entry("item_a", "Bag A"), entry("item_b", "Bag B"), entry("item_c", "Bag C")] });

    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Love" }));

    // The next item is up — and by then the decision is ALREADY in localStorage
    // (enqueue resolves synchronously on the happy path, before the advance).
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    let queued = readQueue(KEY);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: "decision", type: "triage", decision: { itemId: "item_a", result: "top" } });

    await user.click(screen.getByRole("button", { name: "Like" }));
    expect(await screen.findByRole("img", { name: "Bag C" })).toBeInTheDocument();
    queued = readQueue(KEY);
    expect(queued).toHaveLength(2);
    expect(queued[1]).toMatchObject({ decision: { itemId: "item_b", result: "high" } });

    expect(refresh).not.toHaveBeenCalled();
  });

  it("no direct fetch from a tier tap — the entry rides the queue", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Maybe" }));
    await screen.findByRole("img", { name: "Bag B" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("TriageRound round end (queue exhaustion, F6/F15)", () => {
  it("exhaustion ends the round early into the recap; refresh fires exactly once, only after the drain resolves", async () => {
    let resolveDrain!: () => void;
    flusher.triggerFlush.mockImplementation(
      () => new Promise<void>((resolve) => (resolveDrain = resolve)),
    );
    const user = userEvent.setup();
    renderRound({ queue: [entry("item_a", "Bag A")] });

    await user.click(screen.getByRole("button", { name: "Love" }));

    // Recap replaces the round content immediately (client-owned counts)…
    expect(await screen.findByRole("heading", { name: /here.s what moved/i })).toBeInTheDocument();
    // …but the single refresh waits for the drain to settle.
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      resolveDrain();
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(flusher.triggerFlush).toHaveBeenCalled();
  });

  it("timer expiry ends the round into the recap with the same single refresh", async () => {
    vi.useFakeTimers();
    store.setItem("pi-round-box", "5");
    renderRound({ queue: [entry("item_a", "Bag A")] });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_500);
    });

    expect(screen.getByRole("heading", { name: /here.s what moved/i })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("TriageRound frozen recap (F5)", () => {
  it("counts all N unflushed optimistic decisions; the gentle-pass copy is absent", async () => {
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: "Love" }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: "Like" }));

    expect(await screen.findByRole("heading", { name: /here.s what moved/i })).toBeInTheDocument();
    expect(screen.getByText("1 you love")).toBeInTheDocument();
    expect(screen.getByText("1 you like")).toBeInTheDocument();
    expect(screen.queryByText(/gentle pass/i)).not.toBeInTheDocument();
  });

  it("a genuinely empty round still shows the gentle-pass copy — and never refreshes (nothing to flush)", async () => {
    renderRound({ queue: [] });
    expect(await screen.findByText(/gentle pass/i)).toBeInTheDocument();
    await act(async () => {});
    expect(refresh).not.toHaveBeenCalled();
    expect(flusher.triggerFlush).not.toHaveBeenCalled();
  });

  it("pre-round server decisions do not inflate the recap (window filter)", async () => {
    const user = userEvent.setup();
    renderRound({
      queue: [entry("item_a", "Bag A")],
      decisions: [
        { type: "triage", createdAt: new Date(Date.now() - 60_000), decision: { itemId: "item_z", result: "top" } },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Love" }));
    expect(await screen.findByText("1 you love")).toBeInTheDocument();
  });

  it("a post-end prune + rerender (the round-end refresh landing) does not change the displayed counts", async () => {
    const user = userEvent.setup();
    const { rerender } = renderRound({ queue: [entry("item_a", "Bag A")] });

    await user.click(screen.getByRole("button", { name: "Love" }));
    expect(await screen.findByText("1 you love")).toBeInTheDocument();

    // Simulate the refresh landing: the queue is pruned AND the server log now
    // holds the flushed decision — the frozen summary must not double or drop.
    removeEntries(KEY, readQueue(KEY).map((e) => e.clientKey));
    rerender(
      <TriageRound
        curatorId="u1"
        sessionId="sess_1"
        collectionId="coll_1"
        collectionSlugOrId="summer-bags"
        queue={[]}
        decisions={[{ type: "triage", createdAt: new Date(), decision: { itemId: "item_a", result: "top" } }]}
        decidedSeed={1}
        hubHref="/hub"
        setAsideHref="/set-aside"
      />,
    );
    expect(screen.getByText("1 you love")).toBeInTheDocument();
    expect(screen.queryByText("2 you love")).not.toBeInTheDocument();
  });
});

describe("TriageRound '{n} decided so far' (F20)", () => {
  it("seeds from the server count, ticks on the tap, and never shows a zero", async () => {
    const user = userEvent.setup();
    renderRound({ decidedSeed: 2 });
    expect(screen.getByText("2 decided so far")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Love" }));
    expect(await screen.findByText("3 decided so far")).toBeInTheDocument();
  });

  it("omits the cue entirely at zero and dispositions never count", async () => {
    const user = userEvent.setup();
    renderRound({ decidedSeed: 0 });
    expect(screen.queryByText(/decided so far/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /not yet/i }));
    await screen.findByRole("img", { name: "Bag B" });
    expect(screen.queryByText(/decided so far/i)).not.toBeInTheDocument();
  });
});

describe("TriageRound per-entry deferred banner", () => {
  it("shows the 'Ready when you are' block only while the CURRENT entry is deferred", async () => {
    const user = userEvent.setup();
    renderRound({ queue: [entry("item_a", "Bag A"), entry("item_b", "Bag B", true)] });

    expect(screen.queryByText(/ready when you are/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Love" }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(screen.getByText(/ready when you are/i)).toBeInTheDocument();
  });

  it("a 'Not yet' tap moves the item to the round's tail as deferred and it resurfaces with the banner", async () => {
    const user = userEvent.setup();
    renderRound({ queue: [entry("item_a", "Bag A"), entry("item_b", "Bag B")] });

    await user.click(screen.getByRole("button", { name: /not yet/i }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Love" }));

    // Bag A resurfaces at the tail, now wearing the patient-waiting banner.
    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(screen.getByText(/ready when you are/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("TriageRound set-aside stays optimistic and undoable", () => {
  it("a 'Not mine' tap advances immediately and routes the disposition through the provider", async () => {
    const user = userEvent.setup();
    render(
      <TriageUndoProvider collectionId="coll_1">
        <TriageRound
          curatorId="u1"
          sessionId="sess_1"
          collectionId="coll_1"
          collectionSlugOrId="summer-bags"
          queue={[entry("item_a", "Bag A"), entry("item_b", "Bag B")]}
          decisions={[]}
          decidedSeed={0}
          hubHref="/hub"
          setAsideHref="/set-aside"
        />
      </TriageUndoProvider>,
    );

    await user.click(screen.getByRole("button", { name: /not mine/i }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/collections/coll_1/dispositions");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ itemId: "item_a", disposition: "set_aside" });
  });
});

describe("TriageRound undo-as-revisit (F19/F4)", () => {
  it("revisit of a queued entry: back → item re-presents fresh, entry gone from storage, counter decremented", async () => {
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: "Love" }));
    await screen.findByRole("img", { name: "Bag B" });
    expect(screen.getByText("1 decided so far")).toBeInTheDocument();
    expect(readQueue(KEY)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /^back$/i }));

    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(readQueue(KEY)).toEqual([]);
    expect(screen.queryByText(/decided so far/i)).not.toBeInTheDocument();
    // Fresh rendering: nothing pressed, both quiet escapes available.
    expect(screen.getByRole("button", { name: "Love" })).not.toHaveAttribute("aria-pressed");
    expect(screen.getByRole("button", { name: /not yet/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /not mine/i })).toBeInTheDocument();
  });

  it("revisit of an acked entry: standing answer shown selected; a different tap enqueues a superseding entry with a fresh clientKey", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "created" }));
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: "Love" }));
    await screen.findByRole("img", { name: "Bag B" });
    const [first] = readQueue(KEY);

    await user.click(screen.getByRole("button", { name: /^back$/i }));

    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(screen.getByText(/you placed this with love — change it\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Love" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Maybe" }));

    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    const queued = readQueue(KEY);
    expect(queued).toHaveLength(2); // the old ack is untouched; latest-wins supersedes
    expect(queued[0].clientKey).toBe(first.clientKey);
    expect(queued[1].clientKey).not.toBe(first.clientKey);
    expect(queued[1]).toMatchObject({ kind: "decision", decision: { itemId: "item_a", result: "medium" } });
    // A re-answer of a counted item never double-counts (F20).
    expect(screen.getByText("1 decided so far")).toBeInTheDocument();
  });

  it("'Keep going' walks away from a standing answer without re-answering — an honest no-op", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "created" }));
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: "Love" }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    await screen.findByRole("img", { name: "Bag A" });

    await user.click(screen.getByRole("button", { name: /keep going/i }));

    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(readQueue(KEY)).toHaveLength(1); // queue + answer intact
    expect(screen.getByText("1 decided so far")).toBeInTheDocument();
  });

  it("disposition affordances are HIDDEN while the revisited item's triage entry is in flight", async () => {
    flusher.isInFlight.mockReturnValue(true);
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: "Love" }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: /^back$/i }));

    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Love" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /not yet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /not mine/i })).not.toBeInTheDocument();
  });

  it("queued-triage + disposition tap: the queued triage is removed and localStorage holds ONLY the disposition entry", async () => {
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: "Love" }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    await screen.findByRole("img", { name: "Bag A" });

    await user.click(screen.getByRole("button", { name: /not yet/i }));

    await waitFor(() => {
      const queued = readQueue(KEY);
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({ kind: "disposition", itemId: "item_a", disposition: "deferred" });
    });
    // Never a bare fetch — the disposition rides the queue.
    expect(global.fetch).not.toHaveBeenCalled();
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
  });

  it("revisit of a rejected entry is a no-op", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "rejected", reason: "unknown_item" }));
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: "Love" }));
    await screen.findByRole("img", { name: "Bag B" });

    await user.click(screen.getByRole("button", { name: /^back$/i }));

    // Nothing stands to revisit — the round stays where it was.
    expect(screen.getByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Bag A" })).not.toBeInTheDocument();
  });
});

describe("TriageRound storage fallback (F18)", () => {
  it("needs_fallback degrades to ONE awaited single-route POST and advances on its ack", async () => {
    store.setItem = () => {
      throw new Error("quota");
    };
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: "Love" }));

    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sessions/sess_1/decisions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ type: "triage", decision: { itemId: "item_a", result: "top" } });
    expect(body.clientKey).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
    // The quota path asked the flusher to shrink the queue before giving up.
    expect(flusher.triggerFlush).toHaveBeenCalled();
  });

  it("a fallback submit that does not land keeps the item in place with a gentle line", async () => {
    store.setItem = () => {
      throw new Error("quota");
    };
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: "Love" }));

    expect(await screen.findByText(/give it another try in a moment/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(screen.queryByText(/error|failed|invalid/i)).not.toBeInTheDocument();
  });
});
