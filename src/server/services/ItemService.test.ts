import { describe, expect, it, vi } from "vitest";
import { ItemService, PoolGroupError } from "./ItemService";

function makeRepos(overrides: { assign?: number } = {}) {
  const itemRepo = {
    create: vi.fn().mockResolvedValue({ id: "item_new", collectionId: "c1", number: 7, name: null }),
    findById: vi.fn(),
    findByCollection: vi.fn(),
    findByCollectionAndNumber: vi.fn(),
    getNextCatalogNumber: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  };
  const photoRepo = {
    assignPooledPhotosToItem: vi.fn().mockResolvedValue(overrides.assign ?? 2),
  } as any;
  return { itemRepo: itemRepo as any, photoRepo };
}

describe("ItemService.createItemFromPool", () => {
  it("creates an item then assigns the photos, hero = first selected", async () => {
    const { itemRepo, photoRepo } = makeRepos({ assign: 2 });
    const service = new ItemService(itemRepo, photoRepo);

    const item = await service.createItemFromPool("c1", ["p1", "p2"]);

    expect(itemRepo.create).toHaveBeenCalledWith({ collectionId: "c1" });
    expect(photoRepo.assignPooledPhotosToItem).toHaveBeenCalledWith("c1", ["p1", "p2"], "item_new", "p1");
    expect(item.number).toBe(7);
  });

  it("dedupes photoIds before assigning (no false conflict)", async () => {
    const { itemRepo, photoRepo } = makeRepos({ assign: 2 });
    const service = new ItemService(itemRepo, photoRepo);
    await service.createItemFromPool("c1", ["p1", "p2", "p1"]);
    expect(photoRepo.assignPooledPhotosToItem).toHaveBeenCalledWith("c1", ["p1", "p2"], "item_new", "p1");
  });

  it("throws a conflict PoolGroupError when fewer rows assign than requested", async () => {
    const { itemRepo, photoRepo } = makeRepos({ assign: 1 });
    const service = new ItemService(itemRepo, photoRepo);
    await expect(service.createItemFromPool("c1", ["p1", "p2"])).rejects.toMatchObject({
      name: "PoolGroupError",
      code: "conflict",
    });
  });

  it("rejects an empty selection without creating an item", async () => {
    const { itemRepo, photoRepo } = makeRepos();
    const service = new ItemService(itemRepo, photoRepo);
    await expect(service.createItemFromPool("c1", [])).rejects.toBeInstanceOf(PoolGroupError);
    expect(itemRepo.create).not.toHaveBeenCalled();
  });

  it("rejects more than 50 photos without creating an item", async () => {
    const { itemRepo, photoRepo } = makeRepos();
    const service = new ItemService(itemRepo, photoRepo);
    const ids = Array.from({ length: 51 }, (_, i) => `p${i}`);
    await expect(service.createItemFromPool("c1", ids)).rejects.toBeInstanceOf(PoolGroupError);
    expect(itemRepo.create).not.toHaveBeenCalled();
  });
});
