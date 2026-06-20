import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetDb, photoRepo, membershipRepo, collectionRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  photoRepo: { findById: vi.fn(), update: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  collectionRepo: { findById: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(() => photoRepo),
}));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(() => membershipRepo),
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn().mockImplementation(() => collectionRepo),
}));

import { PATCH } from "./route";

const params = { id: "c1", photoId: "p1" };
const updatedAt = new Date(1_700_000_000_000);
function req(body: unknown) {
  return new Request("http://localhost/photo", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as any;
}

describe("PATCH pool photo (rotation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    photoRepo.findById.mockResolvedValue({ id: "p1", itemId: null, collectionId: "c1" });
    membershipRepo.findByUser.mockResolvedValue({ id: "m1", canAddPhotos: true });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    photoRepo.update.mockResolvedValue({ id: "p1", rotation: 90, updatedAt });
  });

  it("401 when unauthenticated; no write", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await PATCH(req({ rotation: 90 }), { params })).status).toBe(401);
    expect(photoRepo.update).not.toHaveBeenCalled();
  });

  it("404 for a photo in another collection (IDOR); no write", async () => {
    photoRepo.findById.mockResolvedValue({ id: "p1", itemId: null, collectionId: "other" });
    expect((await PATCH(req({ rotation: 90 }), { params })).status).toBe(404);
    expect(photoRepo.update).not.toHaveBeenCalled();
  });

  it("404 for an ASSIGNED photo (itemId !== null) via the pool route; no write", async () => {
    photoRepo.findById.mockResolvedValue({ id: "p1", itemId: "item_1", collectionId: "c1" });
    expect((await PATCH(req({ rotation: 90 }), { params })).status).toBe(404);
    expect(photoRepo.update).not.toHaveBeenCalled();
  });

  it("403 for a non-member and 403 for a member without canAddPhotos; no write", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await PATCH(req({ rotation: 90 }), { params })).status).toBe(403);
    membershipRepo.findByUser.mockResolvedValue({ id: "m1", canAddPhotos: false });
    expect((await PATCH(req({ rotation: 90 }), { params })).status).toBe(403);
    expect(photoRepo.update).not.toHaveBeenCalled();
  });

  it("200 persists a valid rotation for a member with canAddPhotos", async () => {
    const res = await PATCH(req({ rotation: 90 }), { params });
    expect(res.status).toBe(200);
    expect(photoRepo.update).toHaveBeenCalledWith("p1", { rotation: 90 });
  });

  it("400 on a bad rotation; no write", async () => {
    expect((await PATCH(req({ rotation: 45 }), { params })).status).toBe(400);
    expect(photoRepo.update).not.toHaveBeenCalled();
  });
});
