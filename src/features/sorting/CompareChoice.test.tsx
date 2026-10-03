// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClientKey } from "@/lib/decision-batch-schema";
import { CompareChoice, COMPARE_ACK_BOUND_MS, COMPARE_SLOW_SAVE_LINE } from "./CompareChoice";
import { readQueue } from "./decisionQueue";
import * as flusher from "./decisionFlusher";
import * as queue from "./decisionQueue";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

// Spy-wrap (NOT stub) the seam modules: the component must go through
// enqueue + triggerFlush (call-sequence assertion, F11) while the REAL engine
// still drains, so the batch POST below is the engine's, never the component's.
vi.mock("./decisionFlusher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./decisionFlusher")>();
  return { ...actual, triggerFlush: vi.fn(actual.triggerFlush) };
});
vi.mock("./decisionQueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./decisionQueue")>();
  return { ...actual, enqueue: vi.fn(actual.enqueue) };
});

// Repository-format item ids: the flusher pre-validates entries against the
// SHARED batch schema, so anything else would be quarantined, never POSTed.
const ITEM_A = "item_0000000000000000000000000a";
const ITEM_B = "item_0000000000000000000000000b";
const ITEM_C = "item_0000000000000000000000000c";
const ITEM_D = "item_0000000000000000000000000d";

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

const item = (id: string, name: string) => ({
  id,
  collectionId: "c",
  number: id === ITEM_A ? 1 : 2,
  name,
  brand: null,
  status: "active",
});

// The module-level engine keeps per-storage-key state across tests — give every
// test its own session so drains/acks can never bleed between tests.
let sessionSeq = 0;
let sessionId = "";

type FetchMock = ReturnType<typeof vi.fn>;

/** fetch mock that acks every batch entry as `created` (HTTP 201). */
function ackAllFetch(): FetchMock {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { decisions: Array<{ clientKey: string }> };
    return {
      ok: true,
      status: 201,
      json: async () => ({
        results: body.decisions.map((d) => ({ clientKey: d.clientKey, status: "created" })),
      }),
    };
  });
}

function batchBody(fetchMock: FetchMock, call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string) as {
    decisions: Array<{ type: string; decision: Record<string, unknown>; clientKey: string }>;
  };
}

function renderChoice(overrides: Partial<Parameters<typeof CompareChoice>[0]> = {}) {
  return render(
    <CompareChoice
      submit={{ kind: "session", sessionId, curatorId: "u1", collectionId: "c" }}
      itemA={item(ITEM_A, "Bag A") as any}
      itemB={item(ITEM_B, "Bag B") as any}
      {...overrides}
    />,
  );
}

describe("CompareChoice images", () => {
  it("browser-loads authenticated hero image URLs directly", () => {
    sessionId = `sess_img`;
    renderChoice({
      heroA: "/api/collections/c/items/a/photos/pa/file",
      heroB: "/api/collections/c/items/b/photos/pb/file",
    });
    expect(screen.getByRole("img", { name: "Bag A" })).toHaveAttribute(
      "src",
      "/api/collections/c/items/a/photos/pa/file",
    );
    expect(screen.getByRole("img", { name: "Bag B" })).toHaveAttribute(
      "src",
      "/api/collections/c/items/b/photos/pb/file",
    );
  });
});

describe("CompareChoice submits through the queue as a batch-of-1 (Epic P Task 14)", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.clearAllMocks();
    installStorage();
    sessionId = `sess_${++sessionSeq}`;
    fetchMock = ackAllFetch();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("a tap never fetches directly: enqueue → triggerFlush, and the ONLY POST is the engine's batch-of-1 with a ClientKey-format key (F11)", async () => {
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // Call sequence: the component talks to the queue + flusher, in that order.
    expect(vi.mocked(queue.enqueue)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(flusher.triggerFlush)).toHaveBeenCalled();
    expect(vi.mocked(queue.enqueue).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(flusher.triggerFlush).mock.invocationCallOrder[0],
    );

    // The one network call is the engine's, to the BATCH endpoint — never the
    // single decisions route, never from the component.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/sessions/${sessionId}/decisions/batch`);
    expect(init.method).toBe("POST");
    const body = batchBody(fetchMock);
    expect(body.decisions).toHaveLength(1);
    expect(body.decisions[0].type).toBe("pairwise_compare");
    expect(body.decisions[0].decision).toEqual({ itemAId: ITEM_A, itemBId: ITEM_B, result: "item_a" });
    expect(ClientKey.safeParse(body.decisions[0].clientKey).success).toBe(true);
  });

  it("tapping item B's card chooses item_b — the card, not a fixed slot, drives the result", async () => {
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Choose Bag B" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(batchBody(fetchMock).decisions[0].decision.result).toBe("item_b");
  });

  it("the Tie and Skip escape hatches send their results", async () => {
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Tie" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(batchBody(fetchMock, 0).decisions[0].decision.result).toBe("tie");

    await user.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(batchBody(fetchMock, 1).decisions[0].decision.result).toBe("skip");
  });

  it("ack resolves → exactly one refresh, and the NEXT pair arrives re-enabled (soft-lock regression)", async () => {
    const user = userEvent.setup();
    const { rerender } = renderChoice();

    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    // The next pair arrives via router.refresh() — same instance, new props.
    rerender(
      <CompareChoice
        submit={{ kind: "session", sessionId, curatorId: "u1", collectionId: "c" }}
        itemA={item(ITEM_A, "Bag C") as any}
        itemB={item(ITEM_B, "Bag D") as any}
      />,
    );

    expect(screen.getByRole("button", { name: "Choose Bag C" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Choose Bag D" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Tie" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Skip" })).toBeEnabled();
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
  });

  it("a rejected ack advances (refresh) — the notice slot explains, not this component", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { decisions: Array<{ clientKey: string }> };
        return {
          ok: true,
          status: 201,
          json: async () => ({
            results: body.decisions.map((d) => ({
              clientKey: d.clientKey,
              status: "rejected",
              reason: "unknown_item",
            })),
          }),
        };
      }),
    );
    const user = userEvent.setup();
    renderChoice();

    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    // Nothing stood, so there is nothing to undo or to announce as chosen.
    expect(screen.queryByRole("button", { name: /^undo/i })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("a sort closed elsewhere (409) never leaves the 'it's safe' line standing", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })));
    renderChoice();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Bag A" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMPARE_ACK_BOUND_MS);
    });
    expect(screen.queryByText(COMPARE_SLOW_SAVE_LINE)).not.toBeInTheDocument();
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument();
  });

  it("after a sort closed elsewhere (409) the controls hold: further taps queue nothing", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })));
    renderChoice();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Bag A" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMPARE_ACK_BOUND_MS);
    });
    vi.mocked(queue.enqueue).mockClear();
    const b = screen.getByRole("button", { name: "Choose Bag B" });
    expect(b).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      fireEvent.click(b);
      fireEvent.click(screen.getByRole("button", { name: "Tie" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.mocked(queue.enqueue)).not.toHaveBeenCalled();
  });

  it("an answer that settled before the 409 cannot be undone once the sort is closed elsewhere", async () => {
    const user = userEvent.setup();
    const { rerender } = renderChoice();
    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(
      <CompareChoice
        submit={{ kind: "session", sessionId, curatorId: "u1", collectionId: "c" }}
        itemA={item(ITEM_C, "Bag C") as any}
        itemB={item(ITEM_D, "Bag D") as any}
      />,
    );
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })));
    await user.click(screen.getByRole("button", { name: "Choose Bag C" }));
    // The 409 notice clears the saving state.
    await waitFor(() => expect(screen.queryByText("Saving…")).not.toBeInTheDocument());

    vi.mocked(queue.enqueue).mockClear();
    const undo = screen.getByRole("button", { name: "Undo: Bag A" });
    expect(undo).toHaveAttribute("aria-disabled", "true");
    await user.click(undo);
    expect(screen.queryByRole("button", { name: "Keep going" })).not.toBeInTheDocument();
    expect(screen.queryByText(/you chose/i)).not.toBeInTheDocument();
    expect(vi.mocked(queue.enqueue)).not.toHaveBeenCalled();
  });

  it("while an answer saves, focus stays on the tapped card and every control holds still (aria-disabled, never disabled)", async () => {
    const user = userEvent.setup();
    const { rerender } = renderChoice();
    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(
      <CompareChoice
        submit={{ kind: "session", sessionId, curatorId: "u1", collectionId: "c" }}
        itemA={item(ITEM_C, "Bag C") as any}
        itemB={item(ITEM_D, "Bag D") as any}
      />,
    );
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const card = screen.getByRole("button", { name: "Choose Bag C" });
    await user.click(card);
    expect(card).toHaveFocus();
    expect(card).toBeEnabled();
    expect(card).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("button", { name: "Tie" }));
    await user.click(screen.getByRole("button", { name: "Undo: Bag A" }));
    expect(screen.queryByText(/you chose/i)).not.toBeInTheDocument();
    expect(vi.mocked(queue.enqueue)).toHaveBeenCalledTimes(2);
  });

  it("an ack delayed past the bound shows the gentle retry line, keeps the entry queued, and a late ack recovers silently (advances)", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slowFetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { decisions: Array<{ clientKey: string }> };
      await gate; // the server just... takes a while
      return {
        ok: true,
        status: 201,
        json: async () => ({
          results: body.decisions.map((d) => ({ clientKey: d.clientKey, status: "created" })),
        }),
      };
    });
    vi.stubGlobal("fetch", slowFetch);
    renderChoice();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Bag A" }));
      await vi.advanceTimersByTimeAsync(0); // enqueue + trigger settle on microtasks
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMPARE_ACK_BOUND_MS);
    });

    // The gentle retry state: exported-constant copy, controls re-enabled, and
    // the queue still holds the entry (the queue entry IS the retry).
    expect(screen.getByText(COMPARE_SLOW_SAVE_LINE)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    const queued = readQueue({ curatorId: "u1", sessionId });
    expect(queued).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Choose Bag B" })).toBeEnabled();

    // The late ack lands → advances silently.
    release?.();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(readQueue({ curatorId: "u1", sessionId })).toHaveLength(0);
  });

  it("retry of the same tap reuses the same clientKey — the queue entry IS the retry, so the server can dedupe", async () => {
    vi.useFakeTimers();
    // First attempt dies on the network → the engine backs off (1 s); the retry
    // POST must carry the SAME clientKey.
    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as { decisions: Array<{ clientKey: string }> };
        return {
          ok: true,
          status: 201,
          json: async () => ({
            results: body.decisions.map((d) => ({ clientKey: d.clientKey, status: "created" })),
          }),
        };
      });
    vi.stubGlobal("fetch", flaky);
    renderChoice();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Bag A" }));
      await vi.advanceTimersByTimeAsync(0); // enqueue + first (failing) POST settle
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000); // backoff step 1 → engine retries
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(batchBody(flaky, 1).decisions[0].clientKey).toBe(batchBody(flaky, 0).decisions[0].clientKey);
    expect(refresh).toHaveBeenCalledTimes(1); // the ack still advanced exactly once
  });

  it("announces the registered choice in a live region that already exists before the choice (SC 4.1.3)", async () => {
    const user = userEvent.setup();
    renderChoice();

    // The region must be in the DOM BEFORE its text changes, or screen readers
    // never announce it.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("You love Bag A more than Bag B.");
  });

  it("a genuinely new tap after a success carries a DIFFERENT clientKey", async () => {
    const user = userEvent.setup();
    const { rerender } = renderChoice();

    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    rerender(
      <CompareChoice
        submit={{ kind: "session", sessionId, curatorId: "u1", collectionId: "c" }}
        itemA={item(ITEM_A, "Bag C") as any}
        itemB={item(ITEM_B, "Bag D") as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Choose Bag C" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(batchBody(fetchMock, 1).decisions[0].clientKey).not.toBe(
      batchBody(fetchMock, 0).decisions[0].clientKey,
    );
  });

  it("Undo names the last answer and re-presents that pair with it selected; a new choice supersedes it", async () => {
    const user = userEvent.setup();
    const { rerender } = renderChoice();
    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(
      <CompareChoice
        submit={{ kind: "session", sessionId, curatorId: "u1", collectionId: "c" }}
        itemA={item(ITEM_C, "Bag C") as any}
        itemB={item(ITEM_D, "Bag D") as any}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Undo: Bag A" }));
    expect(screen.getByText("You chose Bag A — change it?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose Bag A" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Choose Bag B" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(batchBody(fetchMock, 1).decisions[0].decision).toEqual({ itemAId: ITEM_A, itemBId: ITEM_B, result: "item_b" });
    expect(batchBody(fetchMock, 1).decisions[0].clientKey).not.toBe(batchBody(fetchMock, 0).decisions[0].clientKey);
    expect(screen.getByRole("button", { name: "Undo: Bag B" })).toBeInTheDocument();
  });

  it("Keep going leaves the standing answer alone", async () => {
    const user = userEvent.setup();
    const { rerender } = renderChoice();
    await user.click(screen.getByRole("button", { name: "Tie" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(
      <CompareChoice
        submit={{ kind: "session", sessionId, curatorId: "u1", collectionId: "c" }}
        itemA={item(ITEM_C, "Bag C") as any}
        itemB={item(ITEM_D, "Bag D") as any}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Undo: Tie" }));
    expect(screen.getByRole("button", { name: "Tie" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Keep going" }));
    expect(screen.getByRole("button", { name: "Choose Bag C" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("focus follows the swap: Undo lands on Keep going, Keep going lands back on Undo, and the revisit is announced", async () => {
    const user = userEvent.setup();
    const { rerender } = renderChoice();
    await user.click(screen.getByRole("button", { name: "Choose Bag A" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    rerender(
      <CompareChoice
        submit={{ kind: "session", sessionId, curatorId: "u1", collectionId: "c" }}
        itemA={item(ITEM_C, "Bag C") as any}
        itemB={item(ITEM_D, "Bag D") as any}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Undo: Bag A" }));
    expect(screen.getByRole("button", { name: "Keep going" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Back to Bag A and Bag B. You chose Bag A — change it?");

    await user.click(screen.getByRole("button", { name: "Keep going" }));
    expect(screen.getByRole("button", { name: "Undo: Bag A" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Back to Bag C and Bag D.");
  });

  it("a revisit never reuses another pair's unacked clientKey (the new answer still reaches the server)", async () => {
    vi.useFakeTimers();
    let hold = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const posts = vi.fn(async (url: string, init: RequestInit) => {
      if (!url.endsWith("/batch")) return { ok: true, status: 201, json: async () => ({}) }; // direct fallback POST
      if (hold) await gate;
      const body = JSON.parse(init.body as string) as { decisions: Array<{ clientKey: string }> };
      return {
        ok: true,
        status: 201,
        json: async () => ({ results: body.decisions.map((d) => ({ clientKey: d.clientKey, status: "created" })) }),
      };
    });
    vi.stubGlobal("fetch", posts);
    const tap = async (name: string, ms = 0) => {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name }));
        await vi.advanceTimersByTimeAsync(ms);
      });
    };
    const nextPair = (
      <CompareChoice
        submit={{ kind: "session", sessionId, curatorId: "u1", collectionId: "c" }}
        itemA={item(ITEM_C, "Bag C") as any}
        itemB={item(ITEM_D, "Bag D") as any}
      />
    );
    const { rerender } = renderChoice();

    // Pair X answered, then revisited and re-answered with a slow ack: its key stays unacked.
    await tap("Choose Bag A");
    rerender(nextPair);
    await tap("Undo: Bag A");
    hold = true;
    await tap("Choose Bag A", COMPARE_ACK_BOUND_MS);
    expect(screen.getByText(COMPARE_SLOW_SAVE_LINE)).toBeInTheDocument();
    const pairXKey = batchBody(posts, 1).decisions[0].clientKey;

    // Pair Y answered through the not-persisted fallback POST, then revisited with the same choice.
    await tap("Keep going");
    vi.mocked(queue.enqueue).mockResolvedValueOnce("needs_fallback");
    await tap("Choose Bag C");
    await tap("Undo: Bag C");
    await tap("Choose Bag C");
    release();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const sent = posts.mock.calls
      .filter(([url]) => (url as string).endsWith("/batch"))
      .flatMap(([, init]) => (JSON.parse((init as RequestInit).body as string) as ReturnType<typeof batchBody>).decisions);
    const revisitY = sent.find((d) => d.decision.itemAId === ITEM_C);
    expect(revisitY?.decision).toEqual({ itemAId: ITEM_C, itemBId: ITEM_D, result: "item_a" });
    expect(revisitY?.clientKey).not.toBe(pairXKey);
  });
});

describe("CompareChoice local mode (walkthrough demo)", () => {
  const itemA = item(ITEM_A, "Bag A") as any;
  const itemB = item(ITEM_B, "Bag B") as any;

  beforeEach(() => {
    vi.clearAllMocks();
    installStorage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("local mode: tap A calls onDecision('item_a') — no fetch, no enqueue, cards re-enabled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onDecision = vi.fn();
    render(<CompareChoice submit={{ kind: "local", onDecision }} itemA={itemA} itemB={itemB} />);
    await userEvent.click(screen.getByRole("button", { name: new RegExp(itemA.name!, "i") }));
    expect(onDecision).toHaveBeenCalledWith("item_a");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.mocked(queue.enqueue)).not.toHaveBeenCalled(); // local never touches the queue
    expect(refresh).not.toHaveBeenCalled(); // fourth negative: local never advances the route
    expect(screen.queryByText("Saving…")).not.toBeInTheDocument(); // no pending/busy state
    expect(screen.getByRole("button", { name: /tie/i })).toBeEnabled();
  });

  it("local mode: Tie and Skip report their results", async () => {
    const onDecision = vi.fn();
    render(<CompareChoice submit={{ kind: "local", onDecision }} itemA={itemA} itemB={itemB} />);
    await userEvent.click(screen.getByRole("button", { name: /tie/i }));
    expect(onDecision).toHaveBeenCalledWith("tie");
    await userEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(onDecision).toHaveBeenLastCalledWith("skip");
  });
});
