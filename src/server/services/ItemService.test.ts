import { describe, expect, it, vi } from "vitest";
import { ItemService, PoolGroupError } from "./ItemService";

function makeRepos(overrides: { assign?: number; available?: number } = {}) {
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
    countAvailablePooled: vi.fn().mockResolvedValue(overrides.available ?? 2),
    assignPooledPhotosToItem: vi.fn().mockResolvedValue(overrides.assign ?? 2),
    unassignAllFromItem: vi.fn().mockResolvedValue(0),
    findByIds: vi.fn().mockResolvedValue([]),
    reassignPhotos: vi.fn().mockResolvedValue(0),
    findByItem: vi.fn().mockResolvedValue([]),
    setHero: vi.fn().mockResolvedValue(undefined),
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

  it("rejects with conflict (without creating an item) when a photo is unavailable", async () => {
    const { itemRepo, photoRepo } = makeRepos({ available: 1 });
    const service = new ItemService(itemRepo, photoRepo);
    await expect(service.createItemFromPool("c1", ["p1", "p2"])).rejects.toMatchObject({
      name: "PoolGroupError",
      code: "conflict",
    });
    expect(itemRepo.create).not.toHaveBeenCalled();
    expect(photoRepo.assignPooledPhotosToItem).not.toHaveBeenCalled();
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

  it("accepts exactly 50 photos (boundary — the cap is > 50, not >= 50)", async () => {
    const { itemRepo, photoRepo } = makeRepos({ available: 50, assign: 50 });
    const service = new ItemService(itemRepo, photoRepo);
    const ids = Array.from({ length: 50 }, (_, i) => `p${i}`);
    const item = await service.createItemFromPool("c1", ids);
    expect(item).toBeDefined();
    expect(itemRepo.create).toHaveBeenCalled();
  });

  it("on the race backstop (pre-check passes but assign comes up short), soft-deletes the created item so no orphan leaks", async () => {
    const { itemRepo, photoRepo } = makeRepos({ available: 2, assign: 1 });
    const service = new ItemService(itemRepo, photoRepo);
    await expect(service.createItemFromPool("c1", ["p1", "p2"])).rejects.toMatchObject({
      name: "PoolGroupError",
      code: "conflict",
    });
    expect(itemRepo.create).toHaveBeenCalled();
    expect(photoRepo.unassignAllFromItem).toHaveBeenCalledWith("item_new");
    expect(itemRepo.softDelete).toHaveBeenCalledWith("item_new");
  });
});

describe("ItemService.createItemsFromPoolEach", () => {
  it("makes one item per photo, each photo its own hero", async () => {
    const { itemRepo, photoRepo } = makeRepos({ available: 2, assign: 1 });
    const service = new ItemService(itemRepo, photoRepo);

    const items = await service.createItemsFromPoolEach("c1", ["p1", "p2"]);

    expect(items).toHaveLength(2);
    expect(itemRepo.create).toHaveBeenCalledTimes(2);
    expect(photoRepo.assignPooledPhotosToItem).toHaveBeenNthCalledWith(1, "c1", ["p1"], "item_new", "p1");
    expect(photoRepo.assignPooledPhotosToItem).toHaveBeenNthCalledWith(2, "c1", ["p2"], "item_new", "p2");
  });

  it("dedupes photoIds before creating items", async () => {
    const { itemRepo, photoRepo } = makeRepos({ available: 1, assign: 1 });
    const service = new ItemService(itemRepo, photoRepo);
    await service.createItemsFromPoolEach("c1", ["p1", "p1"]);
    expect(itemRepo.create).toHaveBeenCalledTimes(1);
  });

  it("pre-checks availability and creates nothing on conflict", async () => {
    const { itemRepo, photoRepo } = makeRepos({ available: 1 });
    const service = new ItemService(itemRepo, photoRepo);
    await expect(service.createItemsFromPoolEach("c1", ["p1", "p2"])).rejects.toMatchObject({
      name: "PoolGroupError",
      code: "conflict",
    });
    expect(itemRepo.create).not.toHaveBeenCalled();
  });

  it("rejects an empty selection without creating an item", async () => {
    const { itemRepo, photoRepo } = makeRepos();
    const service = new ItemService(itemRepo, photoRepo);
    await expect(service.createItemsFromPoolEach("c1", [])).rejects.toBeInstanceOf(PoolGroupError);
    expect(itemRepo.create).not.toHaveBeenCalled();
  });

  it("rejects more than 50 photos without creating an item", async () => {
    const { itemRepo, photoRepo } = makeRepos();
    const service = new ItemService(itemRepo, photoRepo);
    const ids = Array.from({ length: 51 }, (_, i) => `p${i}`);
    await expect(service.createItemsFromPoolEach("c1", ids)).rejects.toBeInstanceOf(PoolGroupError);
    expect(itemRepo.create).not.toHaveBeenCalled();
  });

  it("each-mode is all-or-nothing: a mid-batch race rolls back every item made and throws conflict", async () => {
    const { itemRepo, photoRepo } = makeRepos();
    itemRepo.create.mockReset();
    itemRepo.create
      .mockResolvedValueOnce({ id: "item_A", number: 1 } as any)
      .mockResolvedValueOnce({ id: "item_B", number: 2 } as any);
    photoRepo.assignPooledPhotosToItem.mockReset();
    photoRepo.assignPooledPhotosToItem.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const service = new ItemService(itemRepo, photoRepo);

    await expect(service.createItemsFromPoolEach("c1", ["p1", "p2"])).rejects.toMatchObject({
      name: "PoolGroupError",
      code: "conflict",
    });
    // both items (the committed first + the raced second) are softDeleted
    expect(itemRepo.softDelete).toHaveBeenCalledWith("item_A");
    expect(itemRepo.softDelete).toHaveBeenCalledWith("item_B");
  });
});

describe("ItemService.reassignPhotos", () => {
  function photo(id: string, itemId: string | null, isHero = false) {
    return { id, itemId, collectionId: "c1", isHero } as any;
  }

  it('new dest: creates an item and reassigns with hero = first id', async () => {
    const { itemRepo, photoRepo } = makeRepos();
    photoRepo.findByIds.mockResolvedValue([photo("p1", "itemA", true), photo("p2", "itemA")]);
    const service = new ItemService(itemRepo, photoRepo);

    const result = await service.reassignPhotos("c1", ["p1", "p2"], { type: "new" });

    expect(itemRepo.create).toHaveBeenCalledWith({ collectionId: "c1" });
    expect(photoRepo.reassignPhotos).toHaveBeenCalledWith("c1", ["p1", "p2"], "item_new", "p1");
    expect(result).toEqual({ number: 7 });
  });

  it('item dest: validates target via repo.findById and reassigns with hero = null', async () => {
    const { itemRepo, photoRepo } = makeRepos();
    photoRepo.findByIds.mockResolvedValue([photo("p1", "itemA")]);
    itemRepo.findById.mockResolvedValue({ id: "itemB", collectionId: "c1", number: 4 });
    photoRepo.findByItem.mockResolvedValue([]); // sources/target reconciled to nothing notable
    const service = new ItemService(itemRepo, photoRepo);

    const result = await service.reassignPhotos("c1", ["p1"], { type: "item", itemId: "itemB" });

    expect(itemRepo.findById).toHaveBeenCalledWith("itemB");
    expect(photoRepo.reassignPhotos).toHaveBeenCalledWith("c1", ["p1"], "itemB", null);
    expect(result).toEqual({ number: 4 });
  });

  it('pool dest: target = null, hero = null, number = null', async () => {
    const { itemRepo, photoRepo } = makeRepos();
    photoRepo.findByIds.mockResolvedValue([photo("p1", "itemA")]);
    const service = new ItemService(itemRepo, photoRepo);

    const result = await service.reassignPhotos("c1", ["p1"], { type: "pool" });

    expect(itemRepo.create).not.toHaveBeenCalled();
    expect(photoRepo.reassignPhotos).toHaveBeenCalledWith("c1", ["p1"], null, null);
    expect(result).toEqual({ number: null });
  });

  it('conflict when findByIds returns fewer than requested', async () => {
    const { itemRepo, photoRepo } = makeRepos();
    photoRepo.findByIds.mockResolvedValue([photo("p1", "itemA")]); // only 1 of 2
    const service = new ItemService(itemRepo, photoRepo);

    await expect(service.reassignPhotos("c1", ["p1", "p2"], { type: "new" })).rejects.toMatchObject({
      name: "PoolGroupError",
      code: "conflict",
    });
    expect(itemRepo.create).not.toHaveBeenCalled();
    expect(photoRepo.reassignPhotos).not.toHaveBeenCalled();
  });

  it('conflict when the target item is missing or cross-collection', async () => {
    const { itemRepo, photoRepo } = makeRepos();
    photoRepo.findByIds.mockResolvedValue([photo("p1", "itemA")]);
    itemRepo.findById.mockResolvedValue({ id: "itemB", collectionId: "OTHER", number: 4 });
    const service = new ItemService(itemRepo, photoRepo);

    await expect(
      service.reassignPhotos("c1", ["p1"], { type: "item", itemId: "itemB" }),
    ).rejects.toMatchObject({ name: "PoolGroupError", code: "conflict" });
    expect(photoRepo.reassignPhotos).not.toHaveBeenCalled();
  });

  it('reconciles a source whose hero moved away by promoting its first remaining photo', async () => {
    const { itemRepo, photoRepo } = makeRepos();
    // Move p1 (itemA's hero) to the pool; itemA keeps p2 (no hero) afterward.
    photoRepo.findByIds.mockResolvedValue([photo("p1", "itemA", true)]);
    photoRepo.findByItem.mockResolvedValue([photo("p2", "itemA", false)]);
    const service = new ItemService(itemRepo, photoRepo);

    await service.reassignPhotos("c1", ["p1"], { type: "pool" });

    expect(photoRepo.findByItem).toHaveBeenCalledWith("itemA");
    expect(photoRepo.setHero).toHaveBeenCalledWith("p2", "itemA");
  });

  it('does not promote a hero when a source still has one', async () => {
    const { itemRepo, photoRepo } = makeRepos();
    photoRepo.findByIds.mockResolvedValue([photo("p1", "itemA")]);
    photoRepo.findByItem.mockResolvedValue([photo("p2", "itemA", true)]); // still has a hero
    const service = new ItemService(itemRepo, photoRepo);

    await service.reassignPhotos("c1", ["p1"], { type: "pool" });

    expect(photoRepo.setHero).not.toHaveBeenCalled();
  });

  it('dedupes ids before validating and reassigning', async () => {
    const { itemRepo, photoRepo } = makeRepos();
    photoRepo.findByIds.mockResolvedValue([photo("p1", "itemA")]);
    const service = new ItemService(itemRepo, photoRepo);

    await service.reassignPhotos("c1", ["p1", "p1"], { type: "pool" });

    expect(photoRepo.findByIds).toHaveBeenCalledWith("c1", ["p1"]);
    expect(photoRepo.reassignPhotos).toHaveBeenCalledWith("c1", ["p1"], null, null);
  });

  it('rejects an empty selection without touching the repos', async () => {
    const { itemRepo, photoRepo } = makeRepos();
    const service = new ItemService(itemRepo, photoRepo);
    await expect(service.reassignPhotos("c1", [], { type: "new" })).rejects.toMatchObject({
      name: "PoolGroupError",
      code: "empty",
    });
    expect(photoRepo.findByIds).not.toHaveBeenCalled();
    expect(itemRepo.create).not.toHaveBeenCalled();
  });

  it('rejects more than 50 photos without touching the repos', async () => {
    const { itemRepo, photoRepo } = makeRepos();
    const service = new ItemService(itemRepo, photoRepo);
    const ids = Array.from({ length: 51 }, (_, i) => `p${i}`);
    await expect(service.reassignPhotos("c1", ids, { type: "new" })).rejects.toMatchObject({
      name: "PoolGroupError",
      code: "too_many",
    });
    expect(photoRepo.findByIds).not.toHaveBeenCalled();
  });
});
