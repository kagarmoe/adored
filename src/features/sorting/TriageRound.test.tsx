// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Item } from "@/types";
import { readQueue, type QueueKey } from "./decisionQueue";
import { TriageRound, type TriageRoundQueueEntry } from "./TriageRound";
import { TriageUndoProvider } from "./TriageUndoProvider";
import { TriageUndoNotice } from "./TriageUndoNotice";

const { refresh, push, replace } = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push, replace }) }));

// The flusher is mocked (call counts / ordering); the queue module stays REAL so
// persist-before-advance is asserted against actual localStorage writes.
const NO_NOTICES: readonly never[] = []; // stable snapshot for useSyncExternalStore
const flusher = vi.hoisted(() => ({
  triggerFlush: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  drain: vi.fn(() => Promise.resolve()),
  useDecisionFlusher: vi.fn(),
  subscribeNoticeSet: vi.fn(() => () => {}),
  getNoticeSet: vi.fn(() => NO_NOTICES),
  awaitAck: vi.fn(() => new Promise(() => {})),
  isInFlight: vi.fn(() => false),
}));
vi.mock("./decisionFlusher", () => flusher);

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
const entry = (id: string, name: string, deferred = false): TriageRoundQueueEntry => ({ item: item(id, name), deferred, heroPhotoUrl: `/photos/${id}.jpg` });

const KEY: QueueKey = { curatorId: "u1", sessionId: "sess_1", collectionId: "coll_1" };
const NEXT = "/collections/bags/sort?phase=pairs";

function props(over: Partial<Parameters<typeof TriageRound>[0]> = {}) {
  return {
    curatorId: "u1",
    sessionId: "sess_1",
    collectionId: "coll_1",
    collectionSlugOrId: "bags",
    queue: [entry("item_a", "Bag A"), entry("item_b", "Bag B")],
    placedSeed: 0,
    nextHref: NEXT,
    ...over,
  };
}
const renderRound = (over: Partial<Parameters<typeof TriageRound>[0]> = {}) => render(<TriageRound {...props(over)} />);
const renderWithUndo = (over: Partial<Parameters<typeof TriageRound>[0]> = {}) =>
  render(
    <TriageUndoProvider curatorId="u1" sessionId="sess_1" collectionId="coll_1">
      <TriageUndoNotice />
      <TriageRound {...props(over)} />
    </TriageUndoProvider>,
  );

let store: Storage;
beforeEach(() => {
  vi.clearAllMocks();
  flusher.triggerFlush.mockImplementation(() => Promise.resolve());
  flusher.drain.mockImplementation(() => Promise.resolve());
  flusher.awaitAck.mockImplementation(() => new Promise(() => {}));
  flusher.isInFlight.mockReturnValue(false);
  store = installStorage();
  global.fetch = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({}) })) as unknown as typeof fetch;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("feelings phase: answers advance optimistically", () => {
  it("announces the saved tier in the live region that existed before the tap (SC 4.1.3)", async () => {
    const user = userEvent.setup();
    renderRound();
    const region = screen.getByRole("status");
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Love — saved.");
  });

  it("persists each answer before the next piece shows, never fetches, never refreshes", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(readQueue(KEY)).toEqual([expect.objectContaining({ kind: "decision", type: "triage", decision: { itemId: "item_a", result: "top" } })]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("when every piece has passed through, lands the answers and hands off to pairs once", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: "Like", exact: true }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(NEXT));
    expect(flusher.drain).toHaveBeenCalledWith([KEY]);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("feelings phase: Not yet and Not mine", () => {
  it("Not yet moves the piece to the end of the phase, where it returns with 'Ready when you are.'", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: /^not yet/i }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(screen.getByText("Ready when you are.")).toBeInTheDocument();
  });

  it("a second Not yet lets a returning piece rest and the phase hands off", async () => {
    const user = userEvent.setup();
    renderRound({ queue: [entry("item_a", "Bag A")] });
    await user.click(screen.getByRole("button", { name: /^not yet/i }));
    expect(await screen.findByText("Ready when you are.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^not yet/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(NEXT));
    expect(readQueue(KEY)).toEqual([expect.objectContaining({ kind: "disposition", itemId: "item_a", disposition: "deferred" })]);
  });

  it("Not mine advances at once and the disposition rides the queue", async () => {
    const user = userEvent.setup();
    renderWithUndo();
    await user.click(screen.getByRole("button", { name: /^not mine/i }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    await waitFor(() => expect(readQueue(KEY)).toEqual([expect.objectContaining({ kind: "disposition", itemId: "item_a", disposition: "set_aside" })]));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("Bring back returns the set-aside piece to this phase", async () => {
    const user = userEvent.setup();
    renderWithUndo();
    await user.click(screen.getByRole("button", { name: /^not mine/i }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: /bring back/i }));
    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    await waitFor(() => expect(readQueue(KEY)).toEqual([]));
  });
});

describe("feelings phase: Undo (spec §4 — 'Undo: Love')", () => {
  it("a still-queued answer: Undo names it, removes it and shows the piece fresh", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: "Undo: Love" }));
    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(readQueue(KEY)).toEqual([]);
    expect(screen.getByRole("button", { name: "Love", exact: true })).not.toHaveAttribute("aria-pressed");
    expect(screen.queryByRole("button", { name: /^undo:/i })).not.toBeInTheDocument();
  });

  it("an answer already sent: shown selected; a different tap supersedes it with a fresh key", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "created" }));
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    const [first] = readQueue(KEY);
    await user.click(screen.getByRole("button", { name: "Undo: Love" }));
    expect(await screen.findByText("You placed this with Love — change it?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Love", exact: true })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Maybe", exact: true }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    const queued = readQueue(KEY);
    expect(queued).toHaveLength(2);
    expect(queued[1].clientKey).not.toBe(first.clientKey);
    expect(queued[1]).toMatchObject({ decision: { itemId: "item_a", result: "medium" } });
  });

  it("'Keep going' walks away from a standing answer without re-answering", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "created" }));
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: "Undo: Love" }));
    await user.click(await screen.findByRole("button", { name: /keep going/i }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(readQueue(KEY)).toHaveLength(1);
  });

  it("Undo swaps to Keep going in place: focus stays on the control and the revisit is announced", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "created" }));
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: "Undo: Love" }));
    const keep = await screen.findByRole("button", { name: "Keep going" });
    expect(keep).toHaveFocus();
    expect(screen.getByText("Back to Bag A. You placed this with Love — change it?")).toBeInTheDocument();
    await user.click(keep);
    expect(screen.getByRole("button", { name: "Undo: Love" })).toHaveFocus();
    expect(screen.getByText("Back to Bag B.")).toBeInTheDocument();
  });

  it("undoing the only queued answer hands focus to the question, never to the page", async () => {
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: "Undo: Love" }));
    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How do you feel about this one?" })).toHaveFocus();
    expect(screen.getByText("Back to Bag A.")).toBeInTheDocument();
  });

  it("a rejected answer has nothing to undo", async () => {
    flusher.awaitAck.mockImplementation(() => Promise.resolve({ status: "rejected", reason: "unknown_item" }));
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    await screen.findByRole("img", { name: "Bag B" });
    await user.click(screen.getByRole("button", { name: "Undo: Love" }));
    expect(screen.getByRole("img", { name: "Bag B" })).toBeInTheDocument();
  });
});

describe("feelings phase: numberless progress", () => {
  it("counts placed pieces for screen readers; Not yet leaves the denominator", async () => {
    const user = userEvent.setup();
    renderRound({ placedSeed: 1 });
    expect(screen.getByText("1 of 3 placed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByText("2 of 3 placed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^not yet/i }));
    expect(await screen.findByText("2 of 2 placed")).toBeInTheDocument();
    expect(screen.queryByText(/decided so far/)).not.toBeInTheDocument();
    // One voice per tap: the answer is announced, the count is read on demand.
    expect(screen.getByText("2 of 2 placed")).not.toHaveAttribute("aria-live");
  });

  it("a piece that came back waiting joins the count once it is placed", async () => {
    const user = userEvent.setup();
    renderRound({ queue: [entry("item_a", "Bag A"), entry("item_b", "Bag B", true)] });
    expect(screen.getByText("0 of 1 placed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByText("1 of 1 placed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Like", exact: true }));
    expect(await screen.findByText("2 of 2 placed")).toBeInTheDocument();
  });
});

describe("feelings phase: storage fallback (F18)", () => {
  it("degrades to ONE awaited single-route POST and advances on its ack", async () => {
    store.setItem = () => {
      throw new Error("quota");
    };
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/sessions/sess_1/decisions");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ type: "triage", decision: { itemId: "item_a", result: "top" } });
  });

  it("a fallback that does not land keeps the piece in place with a gentle line", async () => {
    store.setItem = () => {
      throw new Error("quota");
    };
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: "Love", exact: true }));
    expect(await screen.findByText(/give it another try in a moment/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bag A" })).toBeInTheDocument();
    // Announced only once the answer is safe — this one is not.
    expect(screen.queryByText("Love — saved.")).not.toBeInTheDocument();
  });
});
