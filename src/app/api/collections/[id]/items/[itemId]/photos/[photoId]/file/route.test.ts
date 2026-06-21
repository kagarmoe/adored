import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSession,
  mockGetDb,
  mockServePhotoFile,
  photoRepo,
  itemRepo,
  membershipRepo,
  collectionRepo,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  mockServePhotoFile: vi.fn(),
  photoRepo: { findById: vi.fn() },
  itemRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  collectionRepo: { findById: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/lib/photo-serving", () => ({ servePhotoFile: mockServePhotoFile }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(function () { return photoRepo; }),
}));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({
  ItemRepository: vi.fn().mockImplementation(function () { return itemRepo; }),
}));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(function () { return membershipRepo; }),
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn().mockImplementation(function () { return collectionRepo; }),
}));

import { GET } from "./route";

const params = { id: "c1", itemId: "item_1", photoId: "p1" };
const photo = {
  id: "p1",
  itemId: "item_1",
  collectionId: "c1",
  blobKey: "store/k.jpg",
  mimeType: "image/jpeg",
  updatedAt: new Date(1_700_000_000_000),
  rotation: 0,
};
function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/file?w=640", { headers }) as any;
}

describe("GET item photo file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    itemRepo.findById.mockResolvedValue({ id: "item_1", collectionId: "c1" });
    photoRepo.findById.mockResolvedValue(photo);
    membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    mockServePhotoFile.mockResolvedValue(
      new Response("served", { status: 200, headers: { "x-served": "1" } }),
    );
  });

  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET(req(), { params });
    expect(res.status).toBe(401);
    expect(mockServePhotoFile).not.toHaveBeenCalled();
  });

  it("404 when the item is missing or in another collection", async () => {
    itemRepo.findById.mockResolvedValueOnce(null);
    expect((await GET(req(), { params })).status).toBe(404);
    itemRepo.findById.mockResolvedValueOnce({ id: "item_1", collectionId: "other" });
    expect((await GET(req(), { params })).status).toBe(404);
  });

  it("404 when the photo is missing or not on this item", async () => {
    photoRepo.findById.mockResolvedValueOnce(null);
    expect((await GET(req(), { params })).status).toBe(404);
    photoRepo.findById.mockResolvedValueOnce({ ...photo, itemId: "other_item" });
    expect((await GET(req(), { params })).status).toBe(404);
  });

  it("403 when the user is neither member nor owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    const res = await GET(req(), { params });
    expect(res.status).toBe(403);
    expect(mockServePhotoFile).not.toHaveBeenCalled();
  });

  it("403 wins over a matching If-None-Match (no 304 oracle for an unauthorized caller)", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    const res = await GET(req({ "if-none-match": '"p1:640:1700000000000"' }), { params });
    expect(res.status).toBe(403);
    expect(mockServePhotoFile).not.toHaveBeenCalled();
  });

  it("delegates to servePhotoFile with the photo's serving fields after authz", async () => {
    const request = req();
    const res = await GET(request, { params });
    expect(res.headers.get("x-served")).toBe("1");
    expect(mockServePhotoFile).toHaveBeenCalledOnce();
    expect(mockServePhotoFile).toHaveBeenCalledWith(
      {
        blobKey: "store/k.jpg",
        mimeType: "image/jpeg",
        photoId: "p1",
        collectionId: "c1",
        updatedAt: photo.updatedAt,
        rotation: 0,
      },
      request,
    );
  });

  it("forwards the photo's stored rotation (reads photo.rotation, not a constant)", async () => {
    photoRepo.findById.mockResolvedValue({ ...photo, rotation: 270 });
    await GET(req(), { params });
    expect(mockServePhotoFile).toHaveBeenCalledWith(
      expect.objectContaining({ rotation: 270 }),
      expect.anything(),
    );
  });
});
