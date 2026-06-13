import { describe, expect, it, vi } from "vitest";
import { recordPooledPhoto } from "./recordPooledPhoto";
import type { IPhotoRepository } from "@/server/repositories/PhotoRepository";
import type { Photo } from "@/types";

function fakeRepo(): IPhotoRepository {
  return {
    create: vi.fn(async (data): Promise<Photo> => ({
      id: "photo_x",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...data,
    })),
    findById: vi.fn(),
    findByItem: vi.fn(),
    findPoolByCollection: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    clearHeroPhotos: vi.fn(),
  } as unknown as IPhotoRepository;
}

describe("recordPooledPhoto", () => {
  it("creates a pooled photo (itemId null) with the given collection + blob", async () => {
    const repo = fakeRepo();
    const photo = await recordPooledPhoto(repo, {
      collectionId: "col_1",
      uploadedBy: "user_1",
      blobKey: "https://blob/x.jpg",
      filename: "x.jpg",
      mimeType: "image/jpeg",
      fileSize: 2048,
    });

    expect(repo.create).toHaveBeenCalledWith({
      itemId: null,
      collectionId: "col_1",
      blobKey: "https://blob/x.jpg",
      filename: "x.jpg",
      mimeType: "image/jpeg",
      fileSize: 2048,
      uploadedBy: "user_1",
      isHero: false,
    });
    expect(photo).toMatchObject({
      id: "photo_x",
      itemId: null,
      collectionId: "col_1",
      isHero: false,
    });
  });
});
