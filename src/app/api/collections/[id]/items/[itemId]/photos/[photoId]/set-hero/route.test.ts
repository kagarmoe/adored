// src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/set-hero/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, itemRepo, photoRepo, collectionRepo, membershipRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(() => ({})),
  itemRepo: { findById: vi.fn() },
  photoRepo: { findById: vi.fn(), setHero: vi.fn() },
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));

import { POST } from "./route";

const params = { id: "c1", itemId: "i1", photoId: "p1" };
const call = () => POST({} as any, { params });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  itemRepo.findById.mockResolvedValue({ id: "i1", collectionId: "c1" });
  photoRepo.findById.mockResolvedValue({ id: "p1", itemId: "i1" });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
  photoRepo.setHero.mockResolvedValue(undefined);
});

describe("POST set-hero", () => {
  it("401 unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });
  it("404 when the item is not in the collection — and does NOT set hero", async () => {
    itemRepo.findById.mockResolvedValue({ id: "i1", collectionId: "OTHER" });
    const res = await call();
    expect(res.status).toBe(404);
    expect(photoRepo.setHero).not.toHaveBeenCalled();
  });
  it("404 when the photo is not on the item", async () => {
    photoRepo.findById.mockResolvedValue({ id: "p1", itemId: "OTHER" });
    const res = await call();
    expect(res.status).toBe(404);
    expect(photoRepo.setHero).not.toHaveBeenCalled();
  });
  it("403 when not member or owner — and does NOT set hero", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(403);
    expect(photoRepo.setHero).not.toHaveBeenCalled();
  });
  it("200 for a member; sets hero with the right ids", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(photoRepo.setHero).toHaveBeenCalledWith("p1", "i1");
  });
});
