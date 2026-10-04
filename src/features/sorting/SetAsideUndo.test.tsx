// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// Task 13 (spec §3.3): the provider's POST/DELETE become queue enqueues — the
// network leaves the tap path. The flusher is mocked; the queue is real.
const { triggerFlush, isInFlight } = vi.hoisted(() => ({
  triggerFlush: vi.fn(() => Promise.resolve()),
  isInFlight: vi.fn(() => false),
}));
vi.mock("./decisionFlusher", () => ({ triggerFlush, isInFlight }));

import { TriageUndoProvider, useTriageUndo } from "./TriageUndoProvider";
import { TriageUndoNotice } from "./TriageUndoNotice";
import { readQueue, removeEntries, type QueueKey } from "./decisionQueue";

// The live caller is TriageRound's Not mine (undoCtx.setAside); this stands in for it.
function NotMineTap({ itemId, itemName }: { itemId: string; itemName: string | null }) {
  const { setAside } = useTriageUndo();
  return <button type="button" aria-label="Not mine — sets it aside" onClick={() => void setAside(itemId, itemName)}>Not mine</button>;
}

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

// The set-aside undo is split across three pieces so the undo NOTICE can render
// outside the triage page's empty-state branch (and so survive the queue
// emptying): a context PROVIDER holds the state + the decision-queue enqueue,
// a BUTTON inside the decision sub-row triggers set-aside, and a NOTICE outside
// the branch shows the persistent "Bring back". These tests exercise that
// composition against the REAL localStorage queue (flusher mocked).

function Harness({
  collectionId = "c1",
  itemId = "i1",
  itemName = "A bag" as string | null,
  item = true,
}: {
  collectionId?: string;
  itemId?: string;
  itemName?: string | null;
  item?: boolean;
}) {
  return (
    <TriageUndoProvider curatorId="user_a" sessionId="sess_1" collectionId={collectionId}>
      <TriageUndoNotice />
      {item && <NotMineTap itemId={itemId} itemName={itemName} />}
    </TriageUndoProvider>
  );
}

let store: Storage;

describe("set-aside undo (provider + button + notice) — dispositions ride the queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isInFlight.mockReturnValue(false);
    triggerFlush.mockImplementation(() => Promise.resolve());
    store = installStorage();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it("set-aside enqueues a set_aside disposition — persisted before the notice, NO fetch, NO refresh", async () => {
    render(<Harness itemId="i1" itemName="A bag" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));

    const notice = await screen.findByRole("status");
    // The entry is already in localStorage by the time the undo shows.
    const entries = readQueue(KEY);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "disposition", itemId: "i1", disposition: "set_aside" });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(triggerFlush).toHaveBeenCalledWith(expect.objectContaining({ curatorId: "user_a", sessionId: "sess_1" }));

    expect(notice).toHaveTextContent(/set aside/i);
    expect(notice).toHaveTextContent(/a bag/i);
    expect(notice).toHaveTextContent(/bring back/i);
  });

  it("the notice persists when the item becomes null (queue empties)", async () => {
    const { rerender } = render(<Harness item itemId="i1" itemName="Last bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/last bag/i));

    rerender(<Harness item={false} />);
    expect(screen.queryByRole("button", { name: /not mine/i })).not.toBeInTheDocument();
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/last bag/i);
    expect(screen.getByRole("button", { name: /bring back/i })).toBeInTheDocument();
  });

  it("undo BEFORE flush removes the queued entry — pure client, no DELETE issued", async () => {
    render(<Harness itemId="i1" itemName="A bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await screen.findByRole("status");

    fireEvent.click(screen.getByRole("button", { name: /bring back/i }));

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(readQueue(KEY)).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("undo AFTER flush enqueues a clear entry (the DELETE rides the queue, idempotent)", async () => {
    render(<Harness itemId="i1" itemName="A bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await screen.findByRole("status");
    // Simulate the drain acking the set-aside (removed from storage).
    const [setAsideEntry] = readQueue(KEY);
    removeEntries(KEY, [setAsideEntry.clientKey]);

    fireEvent.click(screen.getByRole("button", { name: /bring back/i }));

    await waitFor(() => expect(readQueue(KEY)).toHaveLength(1));
    expect(readQueue(KEY)[0]).toMatchObject({ kind: "disposition", itemId: "i1", disposition: "clear" });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("undo of an IN-FLIGHT set-aside enqueues a clear — never yanks an entry mid-request", async () => {
    render(<Harness itemId="i1" itemName="A bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await screen.findByRole("status");
    isInFlight.mockReturnValue(true); // the entry is inside an active request now

    fireEvent.click(screen.getByRole("button", { name: /bring back/i }));

    await waitFor(() => expect(readQueue(KEY)).toHaveLength(2));
    expect(readQueue(KEY).map((e) => (e as { disposition: string }).disposition)).toEqual([
      "set_aside",
      "clear",
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("a second set-aside replaces the undo target — undo removes only the second entry", async () => {
    const { rerender } = render(<Harness itemId="i1" itemName="First" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/first/i));

    rerender(<Harness itemId="i2" itemName="Second" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/second/i));
    expect(readQueue(KEY)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /bring back/i }));
    await waitFor(() => expect(readQueue(KEY)).toHaveLength(1));
    expect(readQueue(KEY)[0]).toMatchObject({ itemId: "i1", disposition: "set_aside" });
  });

  it("a double-tap before the first enqueue resolves lands a single entry", async () => {
    render(<Harness itemId="i1" itemName="A bag" />);
    const btn = screen.getByRole("button", { name: /not mine/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await screen.findByRole("status");
    expect(readQueue(KEY)).toHaveLength(1);
  });

  it("renders a decorative middot that is hidden from screen readers", async () => {
    render(<Harness itemId="i1" itemName="A bag" />);
    fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
    const notice = await screen.findByRole("status");
    const sep = notice.querySelector('[aria-hidden="true"]');
    expect(sep).not.toBeNull();
    expect(sep).toHaveTextContent("·");
  });

  describe("storage-unavailable fallback (F18)", () => {
    beforeEach(() => {
      // localStorage refuses every write: enqueue → flush-retry → needs_fallback.
      store.setItem = () => {
        throw new Error("quota");
      };
    });

    it("degrades to today's awaited direct POST and still offers the undo", async () => {
      render(<Harness itemId="i1" itemName="A bag" />);
      fireEvent.click(screen.getByRole("button", { name: /not mine/i }));

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/collections/c1/dispositions",
          expect.objectContaining({ method: "POST" }),
        ),
      );
      const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body).toEqual({ itemId: "i1", disposition: "set_aside" });
      // The quota hook asked the flusher to shrink the queue before giving up.
      expect(triggerFlush).toHaveBeenCalled();
      const notice = await screen.findByRole("status");
      expect(notice).toHaveTextContent(/bring back/i);
      expect(refresh).not.toHaveBeenCalled();
    });

    it("shows a gentle line (never an 'error') when the fallback POST stumbles — no undo offered", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      render(<Harness itemId="i1" itemName="A bag" />);
      fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/another try/i));
      expect(screen.queryByRole("button", { name: /bring back/i })).not.toBeInTheDocument();
      expect(refresh).not.toHaveBeenCalled();
    });

    it("undo after a fallback set-aside DELETEs directly (nothing queued to remove)", async () => {
      render(<Harness itemId="i1" itemName="A bag" />);
      fireEvent.click(screen.getByRole("button", { name: /not mine/i }));
      await screen.findByRole("status");

      fireEvent.click(screen.getByRole("button", { name: /bring back/i }));
      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/collections/c1/dispositions/i1",
          expect.objectContaining({ method: "DELETE" }),
        ),
      );
      await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    });
  });
});
