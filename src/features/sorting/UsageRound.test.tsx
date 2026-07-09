// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Item } from "@/types";
import { readQueue, type QueueKey } from "./decisionQueue";
import { ROUND_COPY, USAGE_PASS_ARIA_LABEL } from "./roundCopy";
import { hasUsageRoundRan } from "@/lib/usage-round-prefs";
import { UsageRound, answeredSoFar, type UsageRoundQueueEntry } from "./UsageRound";

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

// Transparent wrapper over the REAL DecisionControls: records the props it is
// handed each render (so `type="usage"` is pinned) while keeping the real buttons.
const dc = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("./DecisionControls", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./DecisionControls")>();
  return {
    ...actual,
    DecisionControls: (props: Record<string, unknown>) => {
      dc.props.push(props);
      return <actual.DecisionControls {...(props as never)} />;
    },
  };
});

// jsdom in this setup does not expose a working localStorage on file:// URLs —
// install the house Map-backed Storage (see TriageRound.test.tsx).
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

const entry = (id: string, name: string): UsageRoundQueueEntry => ({
  item: item(id, name),
  heroPhotoUrl: `/photos/${id}.jpg`,
});

const KEY: QueueKey = { curatorId: "u1", sessionId: "sess_1", collectionId: "coll_1" };

const YES = "Yes, I use it";
const NO = "Not these days";

function renderRound(over: Partial<Parameters<typeof UsageRound>[0]> = {}) {
  const props = {
    curatorId: "u1",
    sessionId: "sess_1",
    collectionId: "coll_1",
    collectionSlugOrId: "summer-bags",
    queue: [entry("item_a", "Bag A"), entry("item_b", "Bag B")],
    decisions: [],
    usageKnownSeed: 0,
    hubHref: "/hub",
    ...over,
  };
  return render(<UsageRound {...props} />);
}

let store: Storage;

beforeEach(() => {
  vi.clearAllMocks();
  dc.props.length = 0;
  flusher.triggerFlush.mockImplementation(() => Promise.resolve());
  flusher.awaitAck.mockImplementation(() => new Promise(() => {}));
  flusher.isInFlight.mockReturnValue(false);
  store = installStorage();
  global.fetch = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) })) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("UsageRound surface pins (spec §3.4)", () => {
  it("is step 2 of the 4-step arc", () => {
    renderRound();
    expect(
      screen.getByRole("list", { name: /round progress: step 2 of 4/i }),
    ).toBeInTheDocument();
  });

  it("renders the usage question as the h1 — identity with ROUND_COPY.usage.name", () => {
    renderRound();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe(ROUND_COPY.usage.name);
  });

  it("offers exactly Yes / Not these days / Skip — no set-aside or defer affordances", () => {
    renderRound();
    expect(screen.getByRole("button", { name: YES })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: NO })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: USAGE_PASS_ARIA_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /not mine|set aside/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /not yet/i })).not.toBeInTheDocument();
  });

  it("hands DecisionControls type='usage', never a reused 'triage'", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: YES }));
    await screen.findByRole("img", { name: "Bag B" });
    expect(dc.props.length).toBeGreaterThan(0);
    expect(dc.props.every((p) => p.type === "usage")).toBe(true);
  });

  it("shows the round-length chooser while live and drops it on the recap", async () => {
    const user = userEvent.setup();
    renderRound({ queue: [entry("item_a", "Bag A")] });
    expect(screen.getByRole("combobox", { name: "Round length" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: YES }));

    expect(await screen.findByRole("heading", { name: /here.s what moved/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Round length" })).not.toBeInTheDocument();
  });
});

describe("UsageRound optimistic enqueue (persist-before-advance, F15/F18)", () => {
  it("a Yes tap lands a type:'usage' entry in localStorage before the next item renders, zero refresh", async () => {
    const user = userEvent.setup();
    renderRound();

    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: YES }));

    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    const queued = readQueue(KEY);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      kind: "decision",
      type: "usage",
      decision: { itemId: "item_a", result: "uses" },
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a 'Not these days' tap enqueues result:'not_uses' — never a bare fetch", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: NO }));
    await screen.findByRole("img", { name: "Bag B" });
    expect(readQueue(KEY)[0]).toMatchObject({ type: "usage", decision: { itemId: "item_a", result: "not_uses" } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("storage quota → ONE awaited POST of {type:'usage'} to the single route, advancing on its ack", async () => {
    store.setItem = () => {
      throw new Error("quota");
    };
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: YES }));

    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sessions/sess_1/decisions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ type: "usage", decision: { itemId: "item_a", result: "uses" } });
    expect(body.clientKey).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
    expect(flusher.triggerFlush).toHaveBeenCalled();
  });
});

describe("UsageRound pass semantics — writes nothing, cycles at most twice (parent D2/QA-6)", () => {
  it("a Skip re-queues the item at the tail and writes NOTHING", async () => {
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: USAGE_PASS_ARIA_LABEL }));

    // Bag B is up; nothing was persisted, fetched, logged, or counted.
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(readQueue(KEY)).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/answered so far/i)).not.toBeInTheDocument();

    // Bag A sits at the tail: answer B and A returns.
    await user.click(screen.getByRole("button", { name: YES }));
    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
  });

  it("a second pass removes the item from the queue (presented twice → gone)", async () => {
    const user = userEvent.setup();
    renderRound({ queue: [entry("item_a", "Bag A")] });

    await user.click(screen.getByRole("button", { name: USAGE_PASS_ARIA_LABEL }));
    // Only Bag A remained, so it comes right back around for its second showing.
    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: USAGE_PASS_ARIA_LABEL }));
    // Second pass → it leaves the queue → the round exhausts into the recap.
    expect(await screen.findByRole("heading", { name: /here.s what moved/i })).toBeInTheDocument();
  });

  it("an all-pass round terminates into the recap within 2n presentations, counts unchanged", async () => {
    const user = userEvent.setup();
    renderRound(); // 2 items → ≤ 4 presentations

    // A(1)→tail, B(1)→tail, A(2)→gone, B(2)→gone == 4 skips, then exhaustion.
    await user.click(screen.getByRole("button", { name: USAGE_PASS_ARIA_LABEL }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: USAGE_PASS_ARIA_LABEL }));
    await screen.findByRole("img", { name: "Bag A" });
    await user.click(screen.getByRole("button", { name: USAGE_PASS_ARIA_LABEL }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: USAGE_PASS_ARIA_LABEL }));

    expect(await screen.findByRole("heading", { name: /here.s what moved/i })).toBeInTheDocument();
    // Every tap wrote nothing: the recap shows the gentle-pass copy, not counts.
    expect(screen.getByText(/gentle pass/i)).toBeInTheDocument();
    expect(readQueue(KEY)).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("UsageRound answered-count cue (F20)", () => {
  it("seeds from usageKnownSeed, ticks on Yes/No only, and renders via the constant", async () => {
    const user = userEvent.setup();
    renderRound({ usageKnownSeed: 2 });

    expect(screen.getByText(answeredSoFar(2))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: YES }));
    expect(await screen.findByText(answeredSoFar(3))).toBeInTheDocument();

    // A pass on the next item never ticks the count.
    await user.click(screen.getByRole("button", { name: USAGE_PASS_ARIA_LABEL }));
    await screen.findByRole("img", { name: "Bag B" });
    expect(screen.getByText(answeredSoFar(3))).toBeInTheDocument();
  });

  it("omits the cue at zero and decrements it when a queued answer is undone", async () => {
    const user = userEvent.setup();
    renderRound({ usageKnownSeed: 0 });

    expect(screen.queryByText(/answered so far/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: YES }));
    expect(await screen.findByText(answeredSoFar(1))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^back$/i }));
    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(readQueue(KEY)).toEqual([]);
    expect(screen.queryByText(/answered so far/i)).not.toBeInTheDocument();
  });
});

describe("UsageRound undo-as-revisit (F19)", () => {
  it("queued: Back removes the entry and re-presents the item fresh", async () => {
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: YES }));
    await screen.findByRole("img", { name: "Bag B" });
    expect(readQueue(KEY)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /^back$/i }));

    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(readQueue(KEY)).toEqual([]);
    expect(screen.getByRole("button", { name: YES })).not.toHaveAttribute("aria-pressed");
  });

  it("acked: the standing answer shows selected and a different tap enqueues a superseding entry", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "created" }));
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: YES }));
    await screen.findByRole("img", { name: "Bag B" });
    const [first] = readQueue(KEY);

    await user.click(screen.getByRole("button", { name: /^back$/i }));

    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(screen.getByText(/you placed this with yes, i use it — change it\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: YES })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: NO }));

    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    const queued = readQueue(KEY);
    expect(queued).toHaveLength(2);
    expect(queued[0].clientKey).toBe(first.clientKey);
    expect(queued[1].clientKey).not.toBe(first.clientKey);
    expect(queued[1]).toMatchObject({ kind: "decision", type: "usage", decision: { itemId: "item_a", result: "not_uses" } });
    // A re-answer never double-counts.
    expect(screen.getByText(answeredSoFar(1))).toBeInTheDocument();
  });

  it("rejected: Back is a no-op — the round stays put", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "rejected", reason: "unknown_item" }));
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: YES }));
    await screen.findByRole("img", { name: "Bag B" });

    await user.click(screen.getByRole("button", { name: /^back$/i }));

    expect(screen.getByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Bag A" })).not.toBeInTheDocument();
  });
});

describe("UsageRound round end (F15) & recap", () => {
  it("zero mid-round refresh; exactly one at round end after the drain settles", async () => {
    let resolveDrain!: () => void;
    flusher.triggerFlush.mockImplementation(
      () => new Promise<void>((resolve) => (resolveDrain = resolve)),
    );
    const user = userEvent.setup();
    renderRound({ queue: [entry("item_a", "Bag A")] });

    await user.click(screen.getByRole("button", { name: YES }));

    expect(await screen.findByRole("heading", { name: /here.s what moved/i })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => {
      resolveDrain();
    });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("the recap shows this round's usage counts (uses / resting)", async () => {
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: YES }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: NO }));

    expect(await screen.findByRole("heading", { name: /here.s what moved/i })).toBeInTheDocument();
    expect(screen.getByText("1 in your life")).toBeInTheDocument();
    expect(screen.getByText("1 resting for now")).toBeInTheDocument();
  });

  it("timer expiry terminates into the recap just like exhaustion", async () => {
    vi.useFakeTimers();
    store.setItem("pi-round-box", "5");
    renderRound();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_500);
    });

    expect(screen.getByRole("heading", { name: /here.s what moved/i })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("UsageRound demotion memory (markUsageRoundRan, spec §3.8)", () => {
  it("writes the flag on queue exhaustion — even when the person engaged", async () => {
    const user = userEvent.setup();
    renderRound();

    await user.click(screen.getByRole("button", { name: YES }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: NO }));

    await screen.findByRole("heading", { name: /here.s what moved/i });
    expect(hasUsageRoundRan("u1", "sess_1")).toBe(true);
  });

  it("writes the flag on timer expiry with ZERO answers", async () => {
    vi.useFakeTimers();
    store.setItem("pi-round-box", "5");
    renderRound();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_500);
    });

    expect(hasUsageRoundRan("u1", "sess_1")).toBe(true);
  });

  it("does NOT write the flag on timer expiry when at least one answer landed", async () => {
    vi.useFakeTimers();
    store.setItem("pi-round-box", "5");
    renderRound(); // 2 items — answering one keeps the queue non-empty

    // Answer Bag A, then let the ring expire with Bag B still pending.
    fireEvent.click(screen.getByRole("button", { name: YES }));
    await act(async () => {});
    expect(screen.getByRole("img", { name: "Bag B" })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_500);
    });

    expect(screen.getByRole("heading", { name: /here.s what moved/i })).toBeInTheDocument();
    expect(hasUsageRoundRan("u1", "sess_1")).toBe(false);
  });

  it("never writes the flag on an unmount mid-round", () => {
    const { unmount } = renderRound();
    unmount();
    expect(hasUsageRoundRan("u1", "sess_1")).toBe(false);
  });
});
