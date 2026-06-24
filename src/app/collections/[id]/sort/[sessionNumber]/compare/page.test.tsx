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
const A = { id: "item_a", collectionId: "coll_01ABCDEF", number: 1, name: "Bag A", brand: null, status: "active" };
const B = { id: "item_b", collectionId: "coll_01ABCDEF", number: 2, name: "Bag B", brand: null, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  itemRepo.findByCollection.mockResolvedValue([A, B]);
  sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_1", collectionId: "coll_01ABCDEF", number: 1, status: "active", curatorId: "u1" });
  prefRepo.findByCollection.mockResolvedValue([]);
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
    // B is deferred; with A and B the only items, just A is eligible → no pair →
    // the "all comparisons complete" empty state, and B's hero never renders.
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
