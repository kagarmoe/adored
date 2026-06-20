import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetDb, photoRepo, itemRepo, membershipRepo, collectionRepo } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetDb: vi.fn(),
    photoRepo: { findById: vi.fn(), update: vi.fn() },
    itemRepo: { findById: vi.fn() },
    membershipRepo: { findByUser: vi.fn() },
    collectionRepo: { findById: vi.fn() },
  }));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(() => photoRepo),
}));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({
  ItemRepository: vi.fn().mockImplementation(() => itemRepo),
}));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(() => membershipRepo),
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn().mockImplementation(() => collectionRepo),
}));

import { PATCH } from "./route";

const params = { id: "c1", itemId: "item_1", photoId: "p1" };
const updatedAt = new Date(1_700_000_000_000);
function req(body: unknown) {
  return new Request("http://localhost/photo", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as any;
}

describe("PATCH item photo (rotation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    itemRepo.findById.mockResolvedValue({ id: "item_1", collectionId: "c1" });
    photoRepo.findById.mockResolvedValue({ id: "p1", itemId: "item_1", collectionId: "c1" });
    membershipRepo.findByUser.mockResolvedValue({ id: "m1", canAddPhotos: true });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    photoRepo.update.mockResolvedValue({ id: "p1", rotation: 90, updatedAt });
  });

  it("401 when unauthenticated; no write", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await PATCH(req({ rotation: 90 }), { params });
    expect(res.status).toBe(401);
    expect(photoRepo.update).not.toHaveBeenCalled();
  });

  it("404 when the item is missing/another collection; no write", async () => {
    itemRepo.findById.mockResolvedValue(null);
    expect((await PATCH(req({ rotation: 90 }), { params })).status).toBe(404);
    expect(photoRepo.update).not.toHaveBeenCalled();
  });

  it("404 when the photo is missing/not on this item; no write", async () => {
    photoRepo.findById.mockResolvedValue({ id: "p1", itemId: "other", collectionId: "c1" });
    expect((await PATCH(req({ rotation: 90 }), { params })).status).toBe(404);
    expect(photoRepo.update).not.toHaveBeenCalled();
  });

  it("403 for a non-member; no write", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await PATCH(req({ rotation: 90 }), { params })).status).toBe(403);
    expect(photoRepo.update).not.toHaveBeenCalled();
  });

  it("403 for a member WITHOUT canAddPhotos (view-only curator); no write", async () => {
    membershipRepo.findByUser.mockResolvedValue({ id: "m1", canAddPhotos: false });
    expect((await PATCH(req({ rotation: 90 }), { params })).status).toBe(403);
    expect(photoRepo.update).not.toHaveBeenCalled();
  });

  it("200 persists a valid rotation for a member with canAddPhotos", async () => {
    const res = await PATCH(req({ rotation: 90 }), { params });
    expect(res.status).toBe(200);
    expect(photoRepo.update).toHaveBeenCalledWith("p1", { rotation: 90 });
    await expect(res.json()).resolves.toEqual({ rotation: 90, updatedAt: updatedAt.toISOString() });
  });

  it("200 for the owner even without a membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    expect((await PATCH(req({ rotation: 180 }), { params })).status).toBe(200);
  });

  it("400 on a non-allowlisted or non-integer rotation; no write", async () => {
    expect((await PATCH(req({ rotation: 45 }), { params })).status).toBe(400);
    expect((await PATCH(req({ rotation: "90" }), { params })).status).toBe(400);
    expect((await PATCH(req("not json"), { params })).status).toBe(400);
    expect(photoRepo.update).not.toHaveBeenCalled();
  });
});
