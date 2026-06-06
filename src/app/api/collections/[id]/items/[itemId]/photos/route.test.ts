import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MAX_UPLOAD_ERROR } from "@/lib/uploads";

const {
  mockGetSession,
  mockGetDb,
  mockGenerateId,
  mockPut,
  itemRepo,
  collectionRepo,
  membershipRepo,
  photoRepo,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  mockGenerateId: vi.fn(),
  mockPut: vi.fn(),
  itemRepo: {
    findById: vi.fn(),
  },
  collectionRepo: {
    findById: vi.fn(),
  },
  membershipRepo: {
    findByUser: vi.fn(),
  },
  photoRepo: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
}));

vi.mock("@/lib/db", () => ({
  getDb: mockGetDb,
}));

vi.mock("@/lib/id", () => ({
  generateId: mockGenerateId,
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

vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(() => photoRepo),
}));

vi.mock("@vercel/blob", () => ({
  put: mockPut,
}));

import { MAX_SERVER_UPLOAD_BYTES, POST } from "./route";

function makeRequest(file: File | null): Request {
  const formData = new FormData();
  if (file) {
    formData.set("file", file);
  }
  return new Request("http://localhost/api/upload", {
    method: "POST",
    body: formData,
  });
}

function fixtureFile(name: string, type: string): File {
  const bytes = readFileSync(
    path.resolve(process.cwd(), "e2e/fixtures/photos", name)
  );
  return new File([bytes], name, { type });
}

describe("POST /api/collections/[id]/items/[itemId]/photos", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetSession.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
    });
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGenerateId.mockReturnValue("photo-generated");

    itemRepo.findById.mockResolvedValue({
      id: "item-1",
      collectionId: "collection-1",
    });
    collectionRepo.findById.mockResolvedValue({
      id: "collection-1",
      ownerId: "user-2",
    });
    membershipRepo.findByUser.mockResolvedValue({
      id: "membership-1",
      canAddPhotos: true,
    });
    mockPut.mockResolvedValue({
      url: "https://example.blob.vercel-storage.com/photo.jpg",
    });
    photoRepo.create.mockResolvedValue({
      id: "photo-1",
      itemId: "item-1",
      blobKey: "https://example.blob.vercel-storage.com/photo.jpg",
      filename: "bag.jpg",
      mimeType: "image/jpeg",
      fileSize: 5,
      uploadedBy: "user-1",
      isHero: false,
    });
  });

  it("uploads an image and persists the created photo", async () => {
    const request = makeRequest(
      new File([new Uint8Array([1, 2, 3, 4, 5])], "bag.jpg", {
        type: "image/jpeg",
      })
    );

    const response = await POST(request as any, {
      params: { id: "collection-1", itemId: "item-1" },
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: "photo-1",
      itemId: "item-1",
    });

    expect(mockPut).toHaveBeenCalledWith(
      "items/item-1/photo-generated-bag.jpg",
      expect.any(ArrayBuffer),
      {
        access: "private",
        contentType: "image/jpeg",
      }
    );
    expect(photoRepo.create).toHaveBeenCalledWith({
      itemId: "item-1",
      blobKey: "https://example.blob.vercel-storage.com/photo.jpg",
      filename: "bag.jpg",
      mimeType: "image/jpeg",
      fileSize: 5,
      uploadedBy: "user-1",
      isHero: false,
    });
  });

  it("rejects files larger than the server upload limit before blob upload", async () => {
    const oversized = new File([new Uint8Array(MAX_SERVER_UPLOAD_BYTES + 1)], "too-big.jpg", {
      type: "image/jpeg",
    });

    const request = makeRequest(oversized);

    const response = await POST(request as any, {
      params: { id: "collection-1", itemId: "item-1" },
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: MAX_UPLOAD_ERROR,
    });
    expect(mockPut).not.toHaveBeenCalled();
    expect(photoRepo.create).not.toHaveBeenCalled();
  });

  it("accepts the real iPhone JPEG fixture under the server upload limit", async () => {
    const file = fixtureFile("IMG_0428.jpeg", "image/jpeg");
    const request = makeRequest(file);

    const response = await POST(request as any, {
      params: { id: "collection-1", itemId: "item-1" },
    });

    expect(file.size).toBeLessThanOrEqual(MAX_SERVER_UPLOAD_BYTES);
    expect(response.status).toBe(201);
    expect(mockPut).toHaveBeenCalledOnce();
    expect(photoRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "IMG_0428.jpeg",
        mimeType: "image/jpeg",
        fileSize: file.size,
      })
    );
  });

  it("allows the collection owner to upload even when an old collection has no membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({
      id: "collection-1",
      ownerId: "user-1",
    });

    const request = makeRequest(
      new File([new Uint8Array([1, 2, 3])], "owner.jpg", {
        type: "image/jpeg",
      })
    );

    const response = await POST(request as any, {
      params: { id: "collection-1", itemId: "item-1" },
    });

    expect(response.status).toBe(201);
    expect(mockPut).toHaveBeenCalledOnce();
    expect(photoRepo.create).toHaveBeenCalledOnce();
  });
});
