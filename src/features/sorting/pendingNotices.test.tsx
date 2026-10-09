// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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
import { dismissNotice, drain, getNoticeSet } from "./decisionFlusher";
import {
  AUTH_REQUIRED_NOTICE,
  CLOSED_SESSION_DISCARDED_NOTICE,
  DISPOSITION_SUPERSEDED_NOTICE,
  PendingNotices,
  QUARANTINE_NOTICE,
  REJECTED_NOTICE,
  SESSION_CONFLICT_NOTICE,
} from "./pendingNotices";
import { TriageRound } from "./TriageRound";

const { refresh, push, replace } = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push, replace }),
  usePathname: () => "/collections/c1/sort",
}));

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
  vi.unstubAllGlobals();
  installStorage();
  // Engine notices are sticky and module-level: never let one leak into the next test.
  for (const notice of getNoticeSet()) dismissNotice(notice);
  // A fresh queue key per test: the engine's module state is keyed by storage key.
  sessionSeq += 1;
  key = { curatorId: "u1", sessionId: `sess_${sessionSeq}`, collectionId: "coll_1" };
});

describe("PendingNotices — copy constants", () => {
  it("never uses machine-side words (TONE.md)", () => {
    for (const copy of [
      REJECTED_NOTICE,
      QUARANTINE_NOTICE,
      SESSION_CONFLICT_NOTICE,
      AUTH_REQUIRED_NOTICE,
      CLOSED_SESSION_DISCARDED_NOTICE,
      DISPOSITION_SUPERSEDED_NOTICE,
    ]) {
      expect(copy).not.toMatch(/error|failed|invalid/i);
    }
  });
});

describe("PendingNotices — a sort closed elsewhere", () => {
  it("a mid-round 409 says the sort was wrapped up elsewhere", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })) as unknown as typeof fetch;
    render(<PendingNotices collectionId="coll_1" sessionId={key.sessionId} />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement(); // mounted empty BEFORE the notice (SC 4.1.3)
    await enqueue(key, {
      kind: "decision",
      clientKey: newClientKey(),
      type: "triage",
      decision: { itemId: realItemId(), result: "top" },
      enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([key]);
    });
    expect(region).toHaveTextContent(SESSION_CONFLICT_NOTICE); // the same node, now with text
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Okay" })).not.toBeInTheDocument();
  });

  it("another sort's conflict never shows: not on a different sort, not on a surface with no sort", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })) as unknown as typeof fetch;
    render(
      <>
        <div data-testid="this-sort">
          <PendingNotices collectionId="coll_1" sessionId={key.sessionId} />
        </div>
        <PendingNotices collectionId="coll_1" sessionId="sess_other" />
        <PendingNotices collectionId="coll_1" />
      </>,
    );
    await enqueue(key, {
      kind: "decision",
      clientKey: newClientKey(),
      type: "triage",
      decision: { itemId: realItemId(), result: "top" },
      enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([key]);
    });
    // Positive control: the conflict did land, on its own sort's surface only.
    expect(screen.getAllByText(SESSION_CONFLICT_NOTICE)).toHaveLength(1);
    expect(within(screen.getByTestId("this-sort")).getByText(SESSION_CONFLICT_NOTICE)).toBeInTheDocument();
  });

  it("Reload reloads the page", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    global.fetch = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })) as unknown as typeof fetch;
    render(<PendingNotices collectionId="coll_1" sessionId={key.sessionId} />);
    await enqueue(key, {
      kind: "decision",
      clientKey: newClientKey(),
      type: "triage",
      decision: { itemId: realItemId(), result: "top" },
      enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([key]);
    });
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("PendingNotices — signed out mid-round", () => {
  it("a 401 says to sign in again, with a Sign in link back to this page, and no Okay", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    render(<PendingNotices collectionId="coll_1" />);
    await enqueue(key, {
      kind: "decision",
      clientKey: newClientKey(),
      type: "triage",
      decision: { itemId: realItemId(), result: "top" },
      enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([key]);
    });
    expect(screen.getByText(AUTH_REQUIRED_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/login?callbackUrl=${encodeURIComponent("/collections/c1/sort")}`,
    );
    expect(screen.queryByRole("button", { name: "Okay" })).not.toBeInTheDocument(); // signing in is the action
  });
});

describe("PendingNotices — engine clears reach a mounted surface", () => {
  it("a sign-in line leaves once answers save (2xx), and a dismissed notice leaves too", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    render(<PendingNotices collectionId="coll_1" sessionId={key.sessionId} />);
    await enqueue(key, {
      kind: "decision",
      clientKey: newClientKey(),
      type: "triage",
      decision: { itemId: realItemId(), result: "top" },
      enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([key]);
    });
    expect(screen.getByText(AUTH_REQUIRED_NOTICE)).toBeInTheDocument();

    global.fetch = vi.fn(async (_url: string, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body)) as { decisions: Array<{ clientKey: string }> };
      return {
        ok: true,
        status: 201,
        json: async () => ({ results: body.decisions.map((d) => ({ clientKey: d.clientKey, status: "created" })) }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    await act(async () => {
      await drain([key]);
    });
    expect(screen.queryByText(AUTH_REQUIRED_NOTICE)).not.toBeInTheDocument();

    global.fetch = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })) as unknown as typeof fetch;
    await enqueue(key, {
      kind: "decision",
      clientKey: newClientKey(),
      type: "triage",
      decision: { itemId: realItemId(), result: "top" },
      enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([key]);
    });
    expect(screen.getByText(SESSION_CONFLICT_NOTICE)).toBeInTheDocument();
    act(() => getNoticeSet().filter((n) => n.kind === "session_conflict").forEach(dismissNotice));
    expect(screen.queryByText(SESSION_CONFLICT_NOTICE)).not.toBeInTheDocument();
  });
});

describe("PendingNotices — quarantine (F9)", () => {
  it("N quarantined entries in one drain render ONE quiet line, dismissible", async () => {
    render(<PendingNotices collectionId="coll_1" />);
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
  it("a rejected ack renders its notice exactly once, with no refresh, optimistic state retained, and the notice still mounted at the phase hand-off", async () => {
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
        placedSeed={0}
        nextHref="/sort?phase=pairs"
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
    expect(screen.getByText("5 of 6 placed")).toBeInTheDocument();

    // …and the phase hands off to pairs with the notice still on screen. The
    // round never refreshes — not at ack time, not at the hand-off (purses-hzwj):
    // a refresh still committing when the person leaves can eat their next tap.
    await user.click(screen.getByRole("button", { name: "Love" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sort?phase=pairs"));
    expect(screen.getAllByText(REJECTED_NOTICE)).toHaveLength(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("PendingNotices in the round — a sort closed elsewhere", () => {
  it("a mid-round 409 shows the wrapped-up line with Reload on the round's own surface", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })) as unknown as typeof fetch;
    const queue = Array.from({ length: 6 }, (_, i) => {
      const id = realItemId();
      return { item: item(id, `Bag ${i + 1}`), deferred: false, heroPhotoUrl: `/photos/${id}.jpg` };
    });
    const user = userEvent.setup();
    render(
      <TriageRound
        curatorId="u1"
        sessionId={key.sessionId}
        collectionId="coll_1"
        collectionSlugOrId="coll_1"
        queue={queue}
        placedSeed={0}
        nextHref="/sort?phase=pairs"
      />,
    );

    // Five taps hit the ≥5-pending trigger → a real mid-round drain → 409 for this sort.
    for (let i = 1; i <= 5; i++) {
      await user.click(screen.getByRole("button", { name: "Love" }));
    }

    await waitFor(() => expect(screen.getAllByText(SESSION_CONFLICT_NOTICE)).toHaveLength(1));
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });
});

describe("PendingNotices — scoped by collection (purses-w7ss.31)", () => {
  it("a line from another collection's answers stays on that collection; the sign-in and lost-answers lines show everywhere", async () => {
    const other: QueueKey = { ...key, sessionId: `${key.sessionId}_other`, collectionId: "coll_2" };
    render(
      <>
        <div data-testid="here"><PendingNotices collectionId="coll_1" /></div>
        <div data-testid="there"><PendingNotices collectionId="coll_2" /></div>
      </>,
    );
    await enqueue(other, staleEntry());
    await act(async () => {
      await drain([other]);
    });
    expect(within(screen.getByTestId("here")).queryByText(QUARANTINE_NOTICE)).not.toBeInTheDocument();
    expect(within(screen.getByTestId("there")).getByText(QUARANTINE_NOTICE)).toBeInTheDocument();

    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    await enqueue(other, {
      kind: "decision",
      clientKey: newClientKey(),
      type: "triage",
      decision: { itemId: realItemId(), result: "top" },
      enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([other]);
    });
    expect(within(screen.getByTestId("here")).getByText(AUTH_REQUIRED_NOTICE)).toBeInTheDocument();
    expect(within(screen.getByTestId("there")).getByText(AUTH_REQUIRED_NOTICE)).toBeInTheDocument();

    // A recovery (here: a gate on coll_1's page) finds coll_2's sort closed: the answers are gone, so
    // the line is global — coll_1's page says it too (purses-w7ss.31, U2).
    global.fetch = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })) as unknown as typeof fetch;
    await act(async () => {
      await drain([other], { recovery: true });
    });
    expect(within(screen.getByTestId("here")).getByText(CLOSED_SESSION_DISCARDED_NOTICE)).toBeInTheDocument();
    expect(within(screen.getByTestId("there")).getByText(CLOSED_SESSION_DISCARDED_NOTICE)).toBeInTheDocument();
  });
});

describe("PendingNotices — a set-aside an answer had already settled (purses-w7ss.33)", () => {
  it("says anything already felt stays where you placed it, with Okay", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })) as unknown as typeof fetch;
    render(<PendingNotices collectionId="coll_1" />);
    await enqueue(key, {
      kind: "disposition",
      clientKey: newClientKey(),
      itemId: realItemId(),
      disposition: "set_aside",
      enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([key]);
    });
    expect(screen.getByText(DISPOSITION_SUPERSEDED_NOTICE)).toBeInTheDocument();
    // One line stands for every superseded set-aside in the collection, so it names no count.
    expect(DISPOSITION_SUPERSEDED_NOTICE).not.toMatch(/\bone\b/i);
    await userEvent.click(screen.getByRole("button", { name: "Okay" }));
    expect(screen.queryByText(DISPOSITION_SUPERSEDED_NOTICE)).not.toBeInTheDocument();
  });
});
