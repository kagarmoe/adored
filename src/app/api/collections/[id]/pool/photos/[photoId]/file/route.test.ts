import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSession,
  mockGetDb,
  mockServePhotoFile,
  photoRepo,
  membershipRepo,
  collectionRepo,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  mockServePhotoFile: vi.fn(),
  photoRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  collectionRepo: { findById: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/lib/photo-serving", () => ({ servePhotoFile: mockServePhotoFile }));
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

const pooledPhoto = {
  id: "p1",
  collectionId: "c1",
  itemId: null,
  blobKey: "store/k.jpg",
  mimeType: "image/jpeg",
  updatedAt: new Date(1_700_000_000_000),
  rotation: 0,
};
function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/file?w=320", { headers }) as any;
}

describe("GET pool photo file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    photoRepo.findById.mockResolvedValue(pooledPhoto);
    membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    mockServePhotoFile.mockResolvedValue(
      new Response("served", { status: 200, headers: { "x-served": "1" } }),
    );
  });

  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(401);
    expect(mockServePhotoFile).not.toHaveBeenCalled();
  });

  it("404 when the photo is assigned to an item (not pooled)", async () => {
    photoRepo.findById.mockResolvedValue({ ...pooledPhoto, itemId: "item_1" });
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(404);
  });

  it("404 when the photo belongs to another collection", async () => {
    photoRepo.findById.mockResolvedValue({ ...pooledPhoto, collectionId: "other" });
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(404);
  });

  it("403 when the user is neither member nor owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(res.status).toBe(403);
    expect(mockServePhotoFile).not.toHaveBeenCalled();
  });

  it("403 wins over a matching If-None-Match (no 304 oracle for an unauthorized caller)", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await GET(req({ "if-none-match": '"p1:320:1700000000000"' }), {
      params: { id: "c1", photoId: "p1" },
    });
    expect(res.status).toBe(403);
    expect(mockServePhotoFile).not.toHaveBeenCalled();
  });

  it("delegates to servePhotoFile with the photo's serving fields for a member", async () => {
    const request = req();
    const res = await GET(request, { params: { id: "c1", photoId: "p1" } });
    expect(res.headers.get("x-served")).toBe("1");
    expect(mockServePhotoFile).toHaveBeenCalledWith(
      {
        blobKey: "store/k.jpg",
        mimeType: "image/jpeg",
        photoId: "p1",
        collectionId: "c1",
        updatedAt: pooledPhoto.updatedAt,
        rotation: 0,
      },
      request,
    );
  });

  it("forwards the pooled photo's stored rotation", async () => {
    photoRepo.findById.mockResolvedValue({ ...pooledPhoto, rotation: 90 });
    await GET(req(), { params: { id: "c1", photoId: "p1" } });
    expect(mockServePhotoFile).toHaveBeenCalledWith(
      expect.objectContaining({ rotation: 90 }),
      expect.anything(),
    );
  });
});
