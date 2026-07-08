// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// Task 13 (spec §3.3): the session defer rides the decision queue via the
// provider's defer() seam — no fetch on the tap path. Flusher mocked, queue real.
const { triggerFlush, isInFlight } = vi.hoisted(() => ({
  triggerFlush: vi.fn(() => Promise.resolve()),
  isInFlight: vi.fn(() => false),
}));
vi.mock("./decisionFlusher", () => ({ triggerFlush, isInFlight }));

import { DeferControl } from "./DeferControl";
import { TriageUndoProvider } from "./TriageUndoProvider";
import { readQueue, type QueueKey } from "./decisionQueue";

const KEY: QueueKey = { curatorId: "user_a", sessionId: "sess_1", collectionId: "c1" };

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

function SessionHarness({ itemId = "i1" }: { itemId?: string }) {
  return (
    <TriageUndoProvider curatorId="user_a" sessionId="sess_1" collectionId="c1">
      <DeferControl submit={{ kind: "session" }} itemId={itemId} />
    </TriageUndoProvider>
  );
}

let store: Storage;

beforeEach(() => {
  vi.clearAllMocks();
  isInFlight.mockReturnValue(false);
  triggerFlush.mockImplementation(() => Promise.resolve());
  store = installStorage();
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe("DeferControl (session — through the queue)", () => {
  it("defer enqueues a deferred disposition — NO fetch, NO refresh, flush triggered", async () => {
    render(<SessionHarness />);
    fireEvent.click(screen.getByRole("button", { name: /not yet/i }));

    await waitFor(() => expect(readQueue(KEY)).toHaveLength(1));
    expect(readQueue(KEY)[0]).toMatchObject({
      kind: "disposition",
      itemId: "i1",
      disposition: "deferred",
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(triggerFlush).toHaveBeenCalledWith(expect.objectContaining({ curatorId: "user_a", sessionId: "sess_1" }));
  });

  it("does not confirm — a single quiet tap acts (defer is reversible)", async () => {
    render(<SessionHarness />);
    fireEvent.click(screen.getByRole("button", { name: /not yet/i }));
    // No confirmation step intervenes: the entry is queued after one tap.
    await waitFor(() => expect(readQueue(KEY)).toHaveLength(1));
  });

  it("conveys 'I'll come back to this' for assistive tech without shouting it visually", () => {
    render(<SessionHarness />);
    const btn = screen.getByRole("button", { name: /come back to this/i });
    expect(btn).toHaveAttribute("title");
  });

  it("ignores a rapid double-tap — only one entry is enqueued (in-flight guard)", async () => {
    render(<SessionHarness />);
    const btn = screen.getByRole("button", { name: /not yet/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(readQueue(KEY)).toHaveLength(1));
    // Give any stray second enqueue a chance to land before asserting.
    await new Promise((r) => setTimeout(r, 0));
    expect(readQueue(KEY)).toHaveLength(1);
  });

  it("session mode without a provider throws the guiding provider message", () => {
    // Session mode NEEDS the provider (same seam as SetAsideButton); the throw
    // is a developer guard, not a person-facing state.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<DeferControl submit={{ kind: "session" }} itemId="i1" />)).toThrow(
      /within a TriageUndoProvider/i,
    );
    consoleError.mockRestore();
  });

  it("falls back to the awaited direct POST when storage is unavailable (F18)", async () => {
    store.setItem = () => {
      throw new Error("quota");
    };
    render(<SessionHarness />);
    fireEvent.click(screen.getByRole("button", { name: /not yet/i }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/collections/c1/dispositions",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ itemId: "i1", disposition: "deferred" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a fallback POST rejection is swallowed — best-effort, the item simply resurfaces later", async () => {
    store.setItem = () => {
      throw new Error("quota");
    };
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("offline"));
    render(<SessionHarness />);
    fireEvent.click(screen.getByRole("button", { name: /not yet/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    // No crash, no refresh — the tail-resurface is the reconciliation.
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("DeferControl (local — walkthrough)", () => {
  it("local mode: onDecision fires, no fetch, no queue write, button re-enabled", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onDecision = vi.fn();
    render(<DeferControl submit={{ kind: "local", onDecision }} itemId="i1" />);
    const btn = screen.getByRole("button", { name: /not yet/i });
    await userEvent.click(btn);
    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readQueue(KEY)).toEqual([]);
    expect(btn).toBeEnabled();
    expect(btn).toHaveTextContent("Not yet"); // never "Just a moment…"
  });

  it("local mode renders the same visual button (title + aria-label) as session mode", () => {
    const { unmount } = render(<SessionHarness />);
    const session = screen.getByRole("button", { name: /not yet/i });
    const title = session.getAttribute("title");
    const aria = session.getAttribute("aria-label");
    unmount();
    render(<DeferControl submit={{ kind: "local", onDecision: vi.fn() }} itemId="i1" />);
    const local = screen.getByRole("button", { name: /not yet/i });
    expect(local).toHaveAttribute("title", title);
    expect(local).toHaveAttribute("aria-label", aria);
  });
});
