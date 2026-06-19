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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("rankPreferencesToItems", () => {
  it("sorts by score desc, assigns 0-based computedRank, maps rankBucket", () => {
    const items = rankPreferencesToItems([
      preference({ itemId: "mid", score: 0.6, rankBucket: "high" }),
      preference({ itemId: "top", score: 0.9, rankBucket: "top" }),
      preference({ itemId: "low", score: 0.3, rankBucket: "low" }),
    ]);

    expect(items).toEqual([
      { itemId: "top", computedRank: 0, computedBucket: "top" },
      { itemId: "mid", computedRank: 1, computedBucket: "high" },
      { itemId: "low", computedRank: 2, computedBucket: "low" },
    ]);
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
