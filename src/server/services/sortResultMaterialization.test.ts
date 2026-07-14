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

  it("orders globally by orderRank when compare evidence exists, then falls back to bucket order", () => {
    const out = rankPreferencesToItems([
      preference({ itemId: "top-unranked", rankBucket: "top", orderRank: null, score: 0.875 }),
      preference({ itemId: "medium-first", rankBucket: "medium", orderRank: 0, score: 0.375 }),
      preference({ itemId: "low-second", rankBucket: "low", orderRank: 1, score: 0.125 }),
      preference({ itemId: "high-unranked", rankBucket: "high", orderRank: null, score: 0.625 }),
    ]);

    expect(out.map((o) => o.itemId)).toEqual([
      "medium-first",
      "low-second",
      "top-unranked",
      "high-unranked",
    ]);
    expect(out.map((o) => o.computedRank)).toEqual([0, 1, 2, 3]);
    // Bucket stays as annotation/partition context; Compare order does not
    // relabel an Onward item as loved.
    expect(out.map((o) => o.computedBucket)).toEqual(["medium", "low", "top", "high"]);
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
