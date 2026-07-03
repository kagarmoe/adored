// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, itemRepo, sessionRepo, prefRepo, decisionRepo, photoRepo, dispRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemRepo: { findByCollection: vi.fn() },
  sessionRepo: { findByCollectionAndNumber: vi.fn() },
  prefRepo: { findByCollection: vi.fn() },
  decisionRepo: { findBySession: vi.fn() },
  photoRepo: { findCoverPhotosByItemIds: vi.fn() },
  dispRepo: { findByCollectionAndCurator: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(function () { return itemRepo; }) }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(function () { return sessionRepo; }) }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(function () { return prefRepo; }) }));
vi.mock("@/server/repositories/implementations/DecisionEventRepository", () => ({ DecisionEventRepository: vi.fn(function () { return decisionRepo; }) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(function () { return photoRepo; }) }));
vi.mock("@/server/repositories/implementations/ItemDispositionRepository", () => ({ ItemDispositionRepository: vi.fn(function () { return dispRepo; }) }));

import ComparePage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const A = { id: "item_a", collectionId: "coll_01ABCDEF", number: 1, name: "Bag A", brand: null, status: "active", createdAt: new Date(1) };
const B = { id: "item_b", collectionId: "coll_01ABCDEF", number: 2, name: "Bag B", brand: null, status: "active", createdAt: new Date(2) };
const C = { id: "item_c", collectionId: "coll_01ABCDEF", number: 3, name: "Bag C", brand: null, status: "active", createdAt: new Date(3) };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  itemRepo.findByCollection.mockResolvedValue([A, B]);
  sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_1", collectionId: "coll_01ABCDEF", number: 1, status: "active", curatorId: "u1" });
  // Both items are Love/Like so they're in the engine's rankable set; with no
  // comparison recorded yet, selectNextPair asks about exactly this pair.
  prefRepo.findByCollection.mockResolvedValue([
    { itemId: "item_a", rankBucket: "top" },
    { itemId: "item_b", rankBucket: "high" },
  ]);
  decisionRepo.findBySession.mockResolvedValue([]);
  dispRepo.findByCollectionAndCurator.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(
    new Map([
      ["item_a", { id: "pa", itemId: "item_a" }],
      ["item_b", { id: "pb", itemId: "item_b" }],
    ]),
  );
});

describe("ComparePage hero images", () => {
  it("renders both items' hero images using collection.id, batch-loaded once", async () => {
    const ui = await ComparePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    const a = await screen.findByRole("img", { name: "Bag A" });
    const b = await screen.findByRole("img", { name: "Bag B" });
    expect(a.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(a.getAttribute("src")).not.toContain("summer-bags");
    expect(b.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(b.getAttribute("src")).not.toContain("summer-bags");
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
  });
});

describe("ComparePage disposition exclusion (Epic C PR1)", () => {
  it("excludes a disposed item from the pair — only one eligible item leaves no comparison", async () => {
    // A and B are both rankable (top/high), but B is deferred → only A remains in
    // the rankable set → no pair → the "all comparisons complete" empty state, and
    // neither hero renders.
    dispRepo.findByCollectionAndCurator.mockResolvedValue([
      { itemId: "item_b", disposition: "deferred", collectionId: "coll_01ABCDEF", curatorId: "u1" },
    ]);

    const ui = await ComparePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);

    expect(screen.getByText("All comparisons complete")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Bag B" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Bag A" })).not.toBeInTheDocument();
  });
});

describe("ComparePage gentle progress text (Epic 0 Task 8 regression)", () => {
  it("renders 'N comparisons made so far' once at least one pairwise decision exists", async () => {
    // Three rankable items so a pair still remains after one recorded comparison —
    // the page reaches CompareChoice (not the "all complete" state) and must show
    // the gentle, non-gamified count derived from the session's pairwise decisions.
    itemRepo.findByCollection.mockResolvedValue([A, B, C]);
    prefRepo.findByCollection.mockResolvedValue([
      { itemId: "item_a", rankBucket: "top" },
      { itemId: "item_b", rankBucket: "high" },
      { itemId: "item_c", rankBucket: "high" },
    ]);
    photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
    decisionRepo.findBySession.mockResolvedValue([
      {
        id: "dec_1",
        type: "pairwise_compare",
        createdAt: new Date(10),
        decision: { itemAId: "item_a", itemBId: "item_b", result: "item_a" },
      },
    ]);

    const ui = await ComparePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);

    expect(screen.getByText(/comparison(s)? made so far/)).toBeInTheDocument();
    expect(screen.getByText(/1 comparison made so far/)).toBeInTheDocument();
  });

  it("keeps the progress text in the 'all comparisons complete' state (E2E seed: top/high/low, one decision)", async () => {
    // Mirrors seedSortScenario exactly: three items bucketed top/high/low, so only
    // TWO are rankable. After one recorded comparison the 2-item set is fully
    // ordered → selectNextPair returns null → the "all complete" empty state. The
    // gentle count must survive that transition (the Task 8 regression hid it,
    // because the text lived only inside CompareChoice which no longer renders).
    itemRepo.findByCollection.mockResolvedValue([A, B, C]);
    prefRepo.findByCollection.mockResolvedValue([
      { itemId: "item_a", rankBucket: "top" },
      { itemId: "item_b", rankBucket: "high" },
      { itemId: "item_c", rankBucket: "low" },
    ]);
    photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
    decisionRepo.findBySession.mockResolvedValue([
      {
        id: "dec_1",
        type: "pairwise_compare",
        createdAt: new Date(10),
        decision: { itemAId: "item_a", itemBId: "item_b", result: "item_a" },
      },
    ]);

    const ui = await ComparePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);

    expect(screen.getByText("All comparisons complete")).toBeInTheDocument();
    expect(screen.getByText(/comparison(s)? made so far/)).toBeInTheDocument();
    expect(screen.getByText(/1 comparison made so far/)).toBeInTheDocument();
  });

  it("omits the progress text at the zero state (no comparisons yet)", async () => {
    // Default beforeEach: two items, no decisions. A pair is offered, but with
    // zero comparisons made the gentle count must not appear.
    const ui = await ComparePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);

    expect(screen.getByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(screen.queryByText(/comparison(s)? made so far/)).not.toBeInTheDocument();
  });
});

describe("ComparePage round chrome + copy (Epic 4c)", () => {
  it("wraps the compare content in the round shell (step 2 of 3)", async () => {
    const ui = await ComparePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    expect(screen.getByRole("list", { name: /round progress: step 2 of 3/i })).toBeInTheDocument();
    // The live pair still renders inside the shell.
    expect(screen.getByRole("img", { name: "Bag A" })).toBeInTheDocument();
  });

  it("uses the wireframe 'reach for more' / 'the one you'd keep' copy", async () => {
    const ui = await ComparePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    expect(screen.getByRole("heading", { name: /which do you reach for more\?/i })).toBeInTheDocument();
    expect(screen.getByText(/tap the one you'd keep/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /which do you love more\?/i })).not.toBeInTheDocument();
  });
});

describe("ComparePage integrity guard", () => {
  it("redirects (and halts) when the resolved session belongs to a different collection", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_x", collectionId: "coll_OTHER", number: 1, status: "active", curatorId: "u1" });
    await expect(ComparePage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
  });

  it("redirects (and halts) when the user is not the session's curator — independent sort (purses-t9l)", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_x", collectionId: "coll_01ABCDEF", number: 1, status: "active", curatorId: "someone_else" });
    await expect(ComparePage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
  });
});
