import { describe, expect, it } from "vitest";
import {
  rankPreferencesToItems,
  cloneItemsFrom,
} from "./sortResultMaterialization";
import type { CollectionPreferenceItem, SortResultItem } from "@/types";

function preference(
  overrides: Partial<CollectionPreferenceItem> = {},
): CollectionPreferenceItem {
  return {
    id: `pref-${overrides.itemId ?? "x"}`,
    collectionId: "col-1",
    curatorId: "cur-1",
    itemId: "x",
    score: 0.5,
    confidence: 0.5,
    rankBucket: "medium",
    orderRank: null,
    comparisonCount: 1,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function sortResultItem(
  overrides: Partial<SortResultItem> = {},
): SortResultItem {
  return {
    id: `item-${overrides.itemId ?? "x"}`,
    sortResultId: "res-1",
    itemId: "x",
    computedRank: 0,
    computedBucket: "medium",
    manualRank: null,
    manualBucket: null,
    usage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("rankPreferencesToItems", () => {
  it("sorts by bucket priority, assigns 0-based computedRank, maps rankBucket", () => {
    const items = rankPreferencesToItems([
      preference({ itemId: "mid", rankBucket: "high" }),
      preference({ itemId: "top", rankBucket: "top" }),
      preference({ itemId: "low", rankBucket: "low" }),
    ]);

    expect(items).toEqual([
      { itemId: "top", computedRank: 0, computedBucket: "top" },
      { itemId: "mid", computedRank: 1, computedBucket: "high" },
      { itemId: "low", computedRank: 2, computedBucket: "low" },
    ]);
  });

  it("keeps bucket-first ordering when no compare order exists", () => {
    const items = rankPreferencesToItems([
      preference({ itemId: "mid", rankBucket: "high", orderRank: null }),
      preference({ itemId: "top", rankBucket: "top", orderRank: null }),
      preference({ itemId: "low", rankBucket: "low", orderRank: null }),
    ]);

    expect(items).toEqual([
      { itemId: "top", computedRank: 0, computedBucket: "top" },
      { itemId: "mid", computedRank: 1, computedBucket: "high" },
      { itemId: "low", computedRank: 2, computedBucket: "low" },
    ]);
  });

  it("orders by tier first, then orderRank (nulls last) within the tier, then itemId", () => {
    const out = rankPreferencesToItems([
      preference({ itemId: "like-0", rankBucket: "high", orderRank: 0 }),
      preference({ itemId: "love-2", rankBucket: "top", orderRank: 2 }),
      preference({ itemId: "love-null", rankBucket: "top", orderRank: null }),
      preference({ itemId: "love-1", rankBucket: "top", orderRank: 1 }),
      preference({ itemId: "onward", rankBucket: "low", orderRank: 3 }),
    ]);
    expect(out.map((o) => o.itemId)).toEqual(["love-1", "love-2", "love-null", "like-0", "onward"]);
    expect(out.map((o) => o.computedRank)).toEqual([0, 1, 2, 3, 4]);
  });

  it("breaks ties on itemId when bucket and orderRank match", () => {
    const out = rankPreferencesToItems([
      preference({ itemId: "b", rankBucket: "high", orderRank: null }),
      preference({ itemId: "a", rankBucket: "high", orderRank: null }),
    ]);
    expect(out.map((o) => o.itemId)).toEqual(["a", "b"]);
  });

  it("returns [] for no preferences", () => {
    expect(rankPreferencesToItems([])).toEqual([]);
  });
});

describe("cloneItemsFrom", () => {
  it("copies computedRank/computedBucket and omits manual fields from the create-input", () => {
    const cloned = cloneItemsFrom([
      sortResultItem({ itemId: "a", computedRank: 0, computedBucket: "top", manualRank: 5, manualBucket: "low" }),
      sortResultItem({ itemId: "b", computedRank: 1, computedBucket: "low" }),
    ]);

    expect(cloned).toEqual([
      { itemId: "a", computedRank: 0, computedBucket: "top" },
      { itemId: "b", computedRank: 1, computedBucket: "low" },
    ]);
    // The create-input shape carries no manual fields (repo hard-codes them null).
    for (const c of cloned) {
      expect(c).not.toHaveProperty("manualRank");
      expect(c).not.toHaveProperty("manualBucket");
    }
  });
});
