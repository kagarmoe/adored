import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetDb, photoRepo, membershipRepo, collectionRepo } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetDb: vi.fn(),
    photoRepo: { findPoolByCollection: vi.fn() },
    membershipRepo: { findByUser: vi.fn() },
    collectionRepo: { findById: vi.fn() },
  }));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(function () { return photoRepo; }),
}));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(function () { return membershipRepo; }),
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn().mockImplementation(function () { return collectionRepo; }),
}));

import { GET } from "./route";

function req() {
  return new Request("http://localhost/pool/photos") as any;
}

describe("GET /api/collections/[id]/pool/photos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    photoRepo.findPoolByCollection.mockResolvedValue([
      { id: "photo_1", filename: "a.jpg", blobKey: "k", itemId: null, collectionId: "c1" },
      { id: "photo_2", filename: "b.jpg", blobKey: "k2", itemId: null, collectionId: "c1" },
    ]);
  });

  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(req(), { params: { id: "c1" } });
    expect(res.status).toBe(401);
  });

  it("404 when the collection does not exist", async () => {
    collectionRepo.findById.mockResolvedValue(null);
    const res = await GET(req(), { params: { id: "c1" } });
    expect(res.status).toBe(404);
  });

  it("403 when the user is neither member nor owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    const res = await GET(req(), { params: { id: "c1" } });
    expect(res.status).toBe(403);
  });

  it("returns the pooled photos (id + filename) for a member", async () => {
    const res = await GET(req(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      photos: [
        { id: "photo_1", filename: "a.jpg" },
        { id: "photo_2", filename: "b.jpg" },
      ],
    });
  });

  it("allows the owner who has no membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    const res = await GET(req(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
  });
});
