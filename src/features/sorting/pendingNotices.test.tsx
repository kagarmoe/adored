// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ulid } from "ulid";
import type { Item } from "@/types";
import { selectTriageQueue } from "@/lib/triage-selection";
import {
  enqueue,
  newClientKey,
  quarantineEntries,
  readQuarantine,
  type PendingEntry,
  type QueueKey,
} from "./decisionQueue";
// REAL engine — these tests prove the wiring end-to-end (drain → notice → UI).
import { drain } from "./decisionFlusher";
import { PendingNotices, QUARANTINE_NOTICE, REJECTED_NOTICE } from "./pendingNotices";
import { TriageRound } from "./TriageRound";

const { refresh, push } = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

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

const realItemId = () => `item_${ulid().toLowerCase()}`;

const item = (id: string, name: string): Item =>
  ({ id, collectionId: "coll_1", name, brand: null, style: null, color: null, material: null, category: null, number: null, height: null, width: null, depth: null, weight: null, unit: "imperial", status: null, notes: null, createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null }) as Item;

// Shape-valid triage entry with a BAD itemId — fails the shared schema's ItemId
// regex at pre-flush validation, so the engine quarantines it (spec §3.1).
const staleEntry = (): PendingEntry => ({
  kind: "decision",
  clientKey: newClientKey(),
  type: "triage",
  decision: { itemId: "item_short", result: "top" },
  enqueuedAt: new Date().toISOString(),
});

function rejectAllFetch(): void {
  global.fetch = vi.fn(async (_url: string, init: RequestInit = {}) => {
    const body = JSON.parse(String(init.body)) as { decisions: Array<{ clientKey: string }> };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: body.decisions.map((d) => ({
          clientKey: d.clientKey,
          status: "rejected",
          reason: "unknown_item",
        })),
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

let sessionSeq = 0;
let key: QueueKey;

beforeEach(() => {
  vi.clearAllMocks();
  installStorage();
  // A fresh queue key per test: the engine's module state is keyed by storage key.
  sessionSeq += 1;
  key = { curatorId: "u1", sessionId: `sess_${sessionSeq}`, collectionId: "coll_1" };
});

describe("PendingNotices — copy constants", () => {
  it("never uses machine-side words (TONE.md)", () => {
    for (const copy of [REJECTED_NOTICE, QUARANTINE_NOTICE]) {
      expect(copy).not.toMatch(/error|failed|invalid/i);
    }
  });
});

describe("PendingNotices — quarantine (F9)", () => {
  it("N quarantined entries in one drain render ONE quiet line, dismissible", async () => {
    render(<PendingNotices />);
    await enqueue(key, staleEntry());
    await enqueue(key, staleEntry());
    await enqueue(key, staleEntry());

    await act(async () => {
      await drain([key]);
    });

    expect(screen.getAllByText(QUARANTINE_NOTICE)).toHaveLength(1);
    expect(readQuarantine(key)).toHaveLength(3);

    // A second drain with more offenders still collapses to the one line.
    await enqueue(key, staleEntry());
    await act(async () => {
      await drain([key]);
    });
    expect(screen.getAllByText(QUARANTINE_NOTICE)).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /okay/i }));
    expect(screen.queryByText(QUARANTINE_NOTICE)).not.toBeInTheDocument();
  });

  it("quarantine reconciliation: a quarantined item (no event, no preference) reappears in the next selectTriageQueue", () => {
    const itemId = realItemId();
    quarantineEntries(key, [
      {
        kind: "decision",
        clientKey: newClientKey(),
        type: "triage",
        decision: { itemId, result: "top" },
        enqueuedAt: new Date().toISOString(),
      },
    ]);
    // The entry never became a decision event, so no preference exists for the
    // item — the selector simply brings it around again. Resurfacing IS the
    // reconciliation; no compensating write.
    const queue = selectTriageQueue([item(itemId, "Bag")], new Set(), new Map());
    expect(queue.map((e) => e.item.id)).toEqual([itemId]);
  });
});

describe("PendingNotices in the round — rejected acks (F9)", () => {
  it("a rejected ack renders its notice exactly once, with no refresh, optimistic state retained, and the notice still mounted at round end", async () => {
    rejectAllFetch();
    const ids = Array.from({ length: 6 }, () => realItemId());
    const queue = ids.map((id, i) => ({
      item: item(id, `Bag ${i + 1}`),
      deferred: false,
      heroPhotoUrl: `/photos/${id}.jpg`,
    }));
    const user = userEvent.setup();
    render(
      <TriageRound
        curatorId="u1"
        sessionId={key.sessionId}
        collectionId="coll_1"
        collectionSlugOrId="coll_1"
        queue={queue}
        decisions={[]}
        decidedSeed={0}
        hubHref="/hub"
        setAsideHref="/set-aside"
      />,
    );

    // Five taps hit the ≥5-pending trigger → a real mid-round drain → rejected acks.
    for (let i = 1; i <= 5; i++) {
      await user.click(screen.getByRole("button", { name: "Love" }));
    }

    await waitFor(() => expect(screen.getAllByText(REJECTED_NOTICE)).toHaveLength(1));
    // F9: no refresh at ack time — the round keeps its optimistic state…
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Bag 6" })).toBeInTheDocument();
    expect(screen.getByText("5 decided so far")).toBeInTheDocument();

    // …and the round ends into the recap with the notice still on screen. The
    // round never refreshes — not at ack time, not at round end (purses-hzwj):
    // a refresh still committing when the person leaves can eat their next tap.
    await user.click(screen.getByRole("button", { name: "Love" }));
    expect(
      await screen.findByRole("heading", { name: /here.s what moved/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(REJECTED_NOTICE)).toHaveLength(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});
