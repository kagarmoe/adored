// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, redirectMock, resultRepo, resultItemRepo, itemRepo, shareRepo, photoRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }),
  resultRepo: { findByCollectionAndNumber: vi.fn() },
  resultItemRepo: { findByResult: vi.fn() },
  itemRepo: { findByCollection: vi.fn() },
  shareRepo: { findByResult: vi.fn() },
  photoRepo: { findCoverPhotosByItemIds: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
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
  resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "My ranking", status: "draft" });
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

describe("ResultDetailPage hero images (nkp) + resolution", () => {
  it("renders hero + ranked images using collection.id, batch-loaded once", async () => {
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    const hero = await screen.findByRole("img", { name: "Hero Bag" });
    const rest = await screen.findByRole("img", { name: "Rest Bag" });
    expect(hero.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(hero.getAttribute("src")).not.toContain("summer-bags");
    expect(rest.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
    expect(resultItemRepo.findByResult).toHaveBeenCalledWith("res_1"); // dependent query uses the ULID
  });

  it("redirects when the resolved result belongs to a different collection (guard survives)", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_x", collectionId: "coll_OTHER", number: 1, name: "X", status: "draft" });
    await expect(ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } })).rejects.toThrow("REDIRECT");
  });
  it("redirects when no result has that number", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue(null);
    await expect(ResultDetailPage({ params: { id: "summer-bags", resultNumber: "5" } })).rejects.toThrow("REDIRECT");
  });
  it("redirects on a non-numeric segment without hitting the repo", async () => {
    await expect(ResultDetailPage({ params: { id: "summer-bags", resultNumber: "abc" } })).rejects.toThrow("REDIRECT");
    expect(resultRepo.findByCollectionAndNumber).not.toHaveBeenCalled();
  });
});

describe("ResultDetailPage SharePanel curator gate (axn)", () => {
  it("shows SharePanel for the result's curator viewing a finalized result", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({
      id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "finalized", curatorId: "u1",
    });
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    expect(screen.getByRole("heading", { name: /share this result/i })).toBeInTheDocument();
  });

  it("hides SharePanel for a non-curator viewing a finalized result", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({
      id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "finalized", curatorId: "someone_else",
    });
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    expect(screen.queryByRole("heading", { name: /share this result/i })).toBeNull();
  });
});
