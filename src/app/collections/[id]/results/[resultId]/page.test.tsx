// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, resultRepo, resultItemRepo, itemRepo, shareRepo, photoRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  resultRepo: { findById: vi.fn() },
  resultItemRepo: { findByResult: vi.fn() },
  itemRepo: { findByCollection: vi.fn() },
  shareRepo: { findByResult: vi.fn() },
  photoRepo: { findCoverPhotosByItemIds: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({ SortResultRepository: vi.fn(() => resultRepo) }));
vi.mock("@/server/repositories/implementations/SortResultItemRepository", () => ({ SortResultItemRepository: vi.fn(() => resultItemRepo) }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/SortResultShareRepository", () => ({ SortResultShareRepository: vi.fn(() => shareRepo) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }));

import ResultDetailPage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const HERO = { id: "item_hero", collectionId: "coll_01ABCDEF", number: 1, name: "Hero Bag", brand: null, status: "active" };
const REST = { id: "item_rest", collectionId: "coll_01ABCDEF", number: 2, name: "Rest Bag", brand: null, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  resultRepo.findById.mockResolvedValue({ id: "res_1", collectionId: "coll_01ABCDEF", name: "My ranking", status: "draft" });
  resultItemRepo.findByResult.mockResolvedValue([
    { id: "ri_1", itemId: "item_hero", computedRank: 1, manualRank: null, computedBucket: "top", manualBucket: null },
    { id: "ri_2", itemId: "item_rest", computedRank: 2, manualRank: null, computedBucket: "high", manualBucket: null },
  ]);
  itemRepo.findByCollection.mockResolvedValue([HERO, REST]);
  shareRepo.findByResult.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(
    new Map([
      ["item_hero", { id: "ph", itemId: "item_hero" }],
      ["item_rest", { id: "pr", itemId: "item_rest" }],
    ]),
  );
});

describe("ResultDetailPage hero images", () => {
  it("renders hero + ranked images using collection.id, batch-loaded once", async () => {
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultId: "res_1" } });
    render(ui);
    const hero = await screen.findByRole("img", { name: "Hero Bag" });
    const rest = await screen.findByRole("img", { name: "Rest Bag" });
    expect(hero.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(hero.getAttribute("src")).not.toContain("summer-bags");
    expect(rest.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(rest.getAttribute("src")).not.toContain("summer-bags");
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
  });
});
