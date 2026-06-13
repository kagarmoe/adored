import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetDb, mockGet, photoRepo, membershipRepo, collectionRepo } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetDb: vi.fn(),
    mockGet: vi.fn(),
    photoRepo: { findById: vi.fn() },
    membershipRepo: { findByUser: vi.fn() },
    collectionRepo: { findById: vi.fn() },
  }));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@vercel/blob", () => ({ get: mockGet }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(() => photoRepo),
}));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(() => membershipRepo),
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn().mockImplementation(() => collectionRepo),
}));

import { GET } from "./route";

function req() {
  return new Request("http://localhost/file") as any;
}

describe("GET pool photo file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    mockGet.mockResolvedValue({
      statusCode: 200,
      stream: "BYTES",
      blob: { contentType: "image/jpeg" },
    });
  });

  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(401);
  });

  it("404 when the photo is assigned to an item (not pooled)", async () => {
    photoRepo.findById.mockResolvedValue({
      id: "p1", collectionId: "c1", itemId: "item_1", blobKey: "k", mimeType: "image/jpeg",
    });
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(404);
  });

  it("404 when the photo belongs to another collection", async () => {
    photoRepo.findById.mockResolvedValue({
      id: "p1", collectionId: "other", itemId: null, blobKey: "k", mimeType: "image/jpeg",
    });
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(404);
  });

  it("403 when the user is neither member nor owner", async () => {
    photoRepo.findById.mockResolvedValue({
      id: "p1", collectionId: "c1", itemId: null, blobKey: "k", mimeType: "image/jpeg",
    });
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(403);
  });

  it("streams a pooled photo for a member", async () => {
    photoRepo.findById.mockResolvedValue({
      id: "p1", collectionId: "c1", itemId: null, blobKey: "k", mimeType: "image/jpeg",
    });
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledOnce();
  });
});
