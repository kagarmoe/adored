import { describe, expect, it } from "vitest";
import { PairingService } from "./PairingService";
import type { Item, CollectionPreferenceItem } from "@/types";
import type { IItemRepository } from "@/server/repositories/ItemRepository";
import type { ICollectionPreferenceItemRepository } from "@/server/repositories/CollectionPreferenceItemRepository";

const COLLECTION = "col-1";
const CURATOR = "cur-1";

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    collectionId: COLLECTION,
    name: id,
    ...overrides,
  } as Item;
}

function pref(
  itemId: string,
  overrides: Partial<CollectionPreferenceItem> = {},
): CollectionPreferenceItem {
  return {
    id: `pref-${itemId}`,
    collectionId: COLLECTION,
    curatorId: CURATOR,
    itemId,
    score: 0,
    confidence: 0,
    rankBucket: "medium",
    comparisonCount: 0,
    ...overrides,
  } as CollectionPreferenceItem;
}

function buildService(
  items: Item[],
  prefs: CollectionPreferenceItem[],
): PairingService {
  const itemRepo: IItemRepository = {
    findByCollection: async () => items,
  } as unknown as IItemRepository;

  const preferenceRepo: ICollectionPreferenceItemRepository = {
    findByCollection: async () => prefs,
  } as unknown as ICollectionPreferenceItemRepository;

  return new PairingService(itemRepo, preferenceRepo);
}

describe("PairingService.selectNextPair", () => {
  it("returns null with fewer than two items", async () => {
    const service = buildService([item("a")], []);
    const result = await service.selectNextPair(COLLECTION, CURATOR);
    expect(result).toBeNull();
  });

  it("selects the under-compared item first (no-pref scores highest)", async () => {
    const service = buildService(
      [item("settled"), item("fresh")],
      [pref("settled", { comparisonCount: 12, confidence: 0.95 })],
    );
    const result = await service.selectNextPair(COLLECTION, CURATOR);
    expect(result!.itemA.id).toBe("fresh");
  });

  it("ranks low-comparison + low-confidence items above settled ones", async () => {
    const service = buildService(
      [item("a"), item("b"), item("c")],
      [
        pref("a", { comparisonCount: 3, confidence: 0.6 }),
        pref("b", { comparisonCount: 7, confidence: 0.9 }),
        pref("c", { comparisonCount: 12, confidence: 0.95 }),
      ],
    );
    const result = await service.selectNextPair(COLLECTION, CURATOR);
    expect(result!.itemA.id).toBe("a");
    expect(result!.itemB.id).toBe("b");
  });

  it("applies favorites goal bias to a top-bucket item", async () => {
    const service = buildService(
      [item("plain"), item("fave")],
      [
        pref("plain", { comparisonCount: 12, confidence: 0.95 }),
        pref("fave", {
          comparisonCount: 12,
          confidence: 0.95,
          rankBucket: "top",
        }),
      ],
    );
    const result = await service.selectNextPair(
      COLLECTION,
      CURATOR,
      "find favorites",
    );
    expect(result!.itemA.id).toBe("fave");
  });
});

describe("PairingService.prioritizeByGoal", () => {
  it("prioritizeByGoal favorites sorts favorite-status items first", async () => {
    const service = buildService([], []);
    const sorted = await service.prioritizeByGoal(
      [item("active", { status: "active" }), item("fav", { status: "favorite" })],
      "favorites",
    );
    expect(sorted[0].status).toBe("favorite");
  });

  it("prioritizeByGoal returns items unchanged when goal is null", async () => {
    const service = buildService([], []);
    const input = [item("a"), item("b"), item("c")];
    const sorted = await service.prioritizeByGoal(input, null);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });
});
