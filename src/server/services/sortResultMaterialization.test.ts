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

  it("orders by bucket then orderRank asc (NULLS LAST); keeps an unranked loved item", () => {
    // Four loved-or-not prefs sharing scores so the OLD score sort can't order
    // them; only bucket priority + orderRank produces a deterministic sequence.
    const out = rankPreferencesToItems([
      preference({ itemId: "L1", rankBucket: "top", orderRank: 1, score: 0.875 }),
      preference({ itemId: "L0", rankBucket: "top", orderRank: 0, score: 0.875 }),
      preference({ itemId: "Lx", rankBucket: "top", orderRank: null, score: 0.875 }), // loved, never ranked
      preference({ itemId: "M", rankBucket: "medium", orderRank: null, score: 0.375 }),
    ]);

    // top bucket first, ranked 0 then 1, then the unranked loved item (NULLS
    // LAST) still present, then the medium bucket.
    expect(out.map((o) => o.itemId)).toEqual(["L0", "L1", "Lx", "M"]);
    expect(out.map((o) => o.computedRank)).toEqual([0, 1, 2, 3]);
    expect(out.map((o) => o.computedBucket)).toEqual(["top", "top", "top", "medium"]);
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
