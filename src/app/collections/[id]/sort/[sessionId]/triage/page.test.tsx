// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, itemRepo, sessionRepo, prefRepo, photoRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemRepo: { findByCollection: vi.fn() },
  sessionRepo: { findById: vi.fn() },
  prefRepo: { findByCollection: vi.fn() },
  photoRepo: { findCoverPhotosByItemIds: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(() => prefRepo) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }));

import TriagePage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const ITEM = { id: "item_1", collectionId: "coll_01ABCDEF", number: 7, name: "Bag", brand: null, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  itemRepo.findByCollection.mockResolvedValue([ITEM]);
  sessionRepo.findById.mockResolvedValue({ id: "sess_1", collectionId: "coll_01ABCDEF", status: "active" });
  prefRepo.findByCollection.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map([["item_1", { id: "photo_1", itemId: "item_1" }]]));
});

describe("TriagePage hero image", () => {
  it("renders the current item's hero image using collection.id (ULID), not the slug", async () => {
    const ui = await TriagePage({ params: { id: "summer-bags", sessionId: "sess_1" } });
    render(ui);
    const img = await screen.findByRole("img", { name: "Bag" });
    expect(img.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(img.getAttribute("src")).not.toContain("summer-bags");
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledWith(["item_1"]);
  });

  it("shows the initial (no img) when the item has no cover", async () => {
    photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
    const ui = await TriagePage({ params: { id: "summer-bags", sessionId: "sess_1" } });
    render(ui);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});
