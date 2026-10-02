// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
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
vi.mock("@/features/sorting/TriageRound", () => ({
  TriageRound: (p: { queue: Array<{ item: Item }>; placedSeed: number; nextHref: string }) => (
    <div data-testid="feelings" data-next={p.nextHref} data-seed={p.placedSeed}>
      {p.queue.map((e) => e.item.name).join(",")}
    </div>
  ),
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

const visit = async (phase?: string) =>
  render(await SortPage({ params: Promise.resolve({ id: "bags" }), searchParams: Promise.resolve({ phase }) }));

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

  it("once nothing is left to ask, ends quietly with the way to the ranking", async () => {
    h.prefs.mockResolvedValue([pref("a", "top"), pref("b", "medium"), pref("c", "low")]);
    await visit();
    expect(screen.getByRole("heading", { name: "That’s everything for now" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See your ranking" })).toHaveAttribute("href", "/collections/bags/results");
    expect(screen.queryByTestId("pair")).not.toBeInTheDocument();
  });
});
