// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import type { CollectionPreferenceItem, Item } from "@/types";

// The page's own wiring (open-session resolution, ?phase=pairs, the phase switch)
// runs for real against the real chooseSortPhase; the client islands are stubs
// that surface the props the page hands them.
const h = vi.hoisted(() => ({
  sessions: vi.fn(),
  items: vi.fn(),
  prefs: vi.fn(),
  disps: vi.fn(),
  decisions: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/collection-access", () => ({
  requireCollectionAccess: async () => ({ id: "coll_1", slug: "bags", name: "Bags" }),
}));
vi.mock("@/server/api/sessions", () => ({ SessionController: { fromDb: () => ({ listByCollectionAndCurator: h.sessions }) } }));
vi.mock("@/server/api/items", () => ({ ItemController: { fromDb: () => ({ listItems: h.items }) } }));
vi.mock("@/server/api/preferences", () => ({ PreferenceController: { fromDb: () => ({ listItemPreferences: h.prefs }) } }));
vi.mock("@/server/api/dispositions", () => ({ DispositionController: { fromDb: () => ({ listDispositions: h.disps }) } }));
vi.mock("@/server/api/decisions", () => ({ DecisionController: { fromDb: () => ({ listForCurator: h.decisions }) } }));
vi.mock("@/server/api/photos", () => ({ PhotoController: { fromDb: () => ({ findCoverPhotosByItemIds: async () => new Map() }) } }));
vi.mock("@/components/layout", () => ({
  AppLayout: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}));
vi.mock("@/features/sorting/PendingDecisionsGate", () => ({ PendingDecisionsGate: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/features/sorting/TriageUndoProvider", () => ({ TriageUndoProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/features/sorting/TriageUndoNotice", () => ({ TriageUndoNotice: () => null }));
vi.mock("@/features/sorting/PauseControl", () => ({ PauseControl: () => <button type="button">Pause</button> }));
vi.mock("@/features/sorting/ResumeOnLoad", () => ({
  ResumeOnLoad: (p: { sessionId: string }) => <div data-testid="resume" data-session={p.sessionId} />,
}));
// Like the real TriageRound, the stub holds its queue in useState initialised once
// from props — so only a remount (the page's key) shows a new server queue.
vi.mock("@/features/sorting/TriageRound", () => ({
  TriageRound: function Stub(p: { queue: Array<{ item: Item }>; placedSeed: number; nextHref: string }) {
    const [queue] = useState(p.queue);
    return (
      <div data-testid="feelings" data-next={p.nextHref} data-seed={p.placedSeed}>
        {queue.map((e) => e.item.name).join(",")}
      </div>
    );
  },
}));
vi.mock("@/features/sorting/CompareChoice", () => ({
  CompareChoice: (p: { itemA: Item; itemB: Item }) => <div data-testid="pair">{`${p.itemA.name}|${p.itemB.name}`}</div>,
}));
vi.mock("@/features/sessions/KeepSortingButton", () => ({
  KeepSortingButton: (p: { session: unknown }) => <button type="button">{p.session ? "Keep sorting" : "Start sorting"}</button>,
}));

import SortPage from "./page";

const item = (id: string, createdAt = 0): Item =>
  ({ id, collectionId: "coll_1", name: id, deletedAt: null, createdAt: new Date(createdAt) }) as Item;
const pref = (itemId: string, rankBucket: CollectionPreferenceItem["rankBucket"]): CollectionPreferenceItem =>
  ({ id: `p_${itemId}`, collectionId: "coll_1", curatorId: "u1", itemId, score: 0, confidence: 0, rankBucket, comparisonCount: 0 }) as CollectionPreferenceItem;

const page = (phase?: string) => SortPage({ params: Promise.resolve({ id: "bags" }), searchParams: Promise.resolve({ phase }) });
const visit = async (phase?: string) => render(await page(phase));

beforeEach(() => {
  vi.clearAllMocks();
  h.sessions.mockResolvedValue([{ id: "sess_1", status: "active" }]);
  h.items.mockResolvedValue([item("a", 1), item("b", 2), item("c", 3)]);
  h.prefs.mockResolvedValue([]);
  h.disps.mockResolvedValue([]);
  h.decisions.mockResolvedValue([]);
});

describe("the one Sort screen", () => {
  it("with no open sort, offers Start sorting and reads nothing else", async () => {
    h.sessions.mockResolvedValue([{ id: "sess_0", status: "completed" }]);
    await visit();
    expect(screen.getByRole("button", { name: "Start sorting" })).toBeInTheDocument();
    expect(screen.queryByTestId("feelings")).not.toBeInTheDocument();
    expect(h.items).not.toHaveBeenCalled();
  });

  it("asks about unplaced pieces first, seeding progress and handing off to ?phase=pairs", async () => {
    h.prefs.mockResolvedValue([pref("a", "top")]);
    await visit();
    const feelings = screen.getByTestId("feelings");
    expect(feelings).toHaveTextContent("b,c");
    expect(feelings).toHaveAttribute("data-seed", "1");
    expect(feelings).toHaveAttribute("data-next", "/collections/bags/sort?phase=pairs");
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See your ranking so far" })).toHaveAttribute("href", "/collections/bags/results");
  });

  it("a Not yet piece holds feelings open until ?phase=pairs, which moves on to Love + Like pairs", async () => {
    h.prefs.mockResolvedValue([pref("a", "top"), pref("b", "high")]);
    h.disps.mockResolvedValue([{ itemId: "c", disposition: "deferred" }]);
    await visit();
    expect(screen.getByTestId("feelings")).toHaveTextContent("c");
    await visit("pairs");
    expect(screen.getByTestId("pair")).toHaveTextContent(/^(a\|b|b\|a)$/);
  });

  it("the hand-off line sits above the question, and only until a pair answer of this sort has landed", async () => {
    h.prefs.mockResolvedValue([pref("a", "top"), pref("b", "high"), pref("c", "low")]);
    await visit("pairs");
    const intro = screen.getByText("Now, between these two…");
    const question = screen.getByRole("heading", { name: "Which would you reach for first?" });
    expect(intro.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    h.decisions.mockResolvedValue([{ id: "e1", sessionId: "sess_1", type: "pairwise_compare", decision: {}, createdAt: new Date() }]);
    document.body.innerHTML = "";
    await visit("pairs");
    expect(screen.queryByText("Now, between these two…")).not.toBeInTheDocument();
  });

  it("once nothing is left to ask, ends quietly with the way to the ranking", async () => {
    h.prefs.mockResolvedValue([pref("a", "top"), pref("b", "medium"), pref("c", "low")]);
    await visit();
    // The last pair's controls are gone; focus lands on the ending, not on <body>.
    expect(screen.getByRole("heading", { name: "That’s everything for now" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "See your ranking" })).toHaveAttribute("href", "/collections/bags/results");
    expect(screen.queryByTestId("pair")).not.toBeInTheDocument();
  });

  it("a paused sort opened by URL is resumed by a client island, not during render", async () => {
    h.sessions.mockResolvedValue([{ id: "sess_1", status: "paused" }]);
    await visit();
    expect(screen.getByTestId("resume")).toHaveAttribute("data-session", "sess_1");
    expect(screen.getByTestId("feelings")).toBeInTheDocument();
  });

  it("an active sort mounts no resume island", async () => {
    await visit();
    expect(screen.queryByTestId("resume")).not.toBeInTheDocument();
  });

  it("a new feelings queue from the server remounts the round (no stale hand-off state)", async () => {
    const { rerender } = await visit();
    expect(screen.getByTestId("feelings")).toHaveTextContent("a,b,c");
    // The hand-off replaced to ?phase=pairs, but a new piece (d) still needs a feeling.
    h.items.mockResolvedValue([item("a", 1), item("b", 2), item("c", 3), item("d", 4)]);
    h.prefs.mockResolvedValue([pref("a", "top"), pref("b", "high"), pref("c", "medium")]);
    rerender(await page("pairs"));
    expect(screen.getByTestId("feelings")).toHaveTextContent(/^d$/);
  });
});
