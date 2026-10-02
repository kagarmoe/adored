import { describe, expect, it } from "vitest";
import {
  rankPreferencesToItems,
  cloneItemsFrom,
  applyPins,
  buildRanking,
  savedOrderPositions,
  pinsFromRows,
  type Pin,
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

const pin = (itemId: string, position: number, at = 0): Pin => ({ itemId, position, pinnedAt: new Date(at) });

describe("applyPins (spec §4: a pinned piece does not move with later pair answers)", () => {
  it("keeps a pinned piece in its slot while the derived order moves around it", () => {
    expect(applyPins(["a", "b", "c", "d"], [pin("b", 1)])).toEqual(["b", "a", "c", "d"]);
    expect(applyPins(["d", "c", "b", "a"], [pin("b", 1)])).toEqual(["b", "d", "c", "a"]);
  });

  it("returns the derived order untouched once the pin is gone (Unpin)", () => {
    expect(applyPins(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  it("clamps a pin past either end", () => {
    expect(applyPins(["a", "b", "c"], [pin("a", 99)])).toEqual(["b", "c", "a"]);
    expect(applyPins(["a", "b", "c"], [pin("c", 0)])).toEqual(["c", "a", "b"]);
  });

  it("gives a shared slot to the newer pin and moves the older one down", () => {
    expect(applyPins(["a", "b", "c"], [pin("a", 2, 1), pin("c", 2, 2)])).toEqual(["b", "c", "a"]);
  });

  it("ignores pins for pieces no longer in the list", () => {
    expect(applyPins(["a", "b"], [pin("gone", 1)])).toEqual(["a", "b"]);
  });
});

describe("buildRanking", () => {
  it("splits loved (Love, Like, Maybe) from Onward and pins only inside the loved list", () => {
    const out = buildRanking(
      [
        preference({ itemId: "love", rankBucket: "top", orderRank: 0 }),
        preference({ itemId: "like", rankBucket: "high", orderRank: 1 }),
        preference({ itemId: "maybe", rankBucket: "medium" }),
        preference({ itemId: "onward", rankBucket: "low" }),
      ],
      new Set(["love", "like", "maybe", "onward"]),
      [pin("maybe", 1), pin("onward", 1)],
    );
    expect(out.loved.map((e) => [e.itemId, e.bucket, e.pinned])).toEqual([
      ["maybe", "medium", true],
      ["love", "top", false],
      ["like", "high", false],
    ]);
    expect(out.onward.map((e) => e.itemId)).toEqual(["onward"]);
  });

  it("drops pieces that are no longer live, and their pins", () => {
    const out = buildRanking(
      [preference({ itemId: "a", rankBucket: "top" }), preference({ itemId: "archived", rankBucket: "top" })],
      new Set(["a"]),
      [pin("archived", 1)],
    );
    expect(out.loved.map((e) => e.itemId)).toEqual(["a"]);
  });
});

describe("savedOrderPositions (a revision starts from the saved order)", () => {
  it("numbers the saved loved order from 1 and leaves Onward unpinned", () => {
    const rows = [
      sortResultItem({ itemId: "b", computedRank: 1, computedBucket: "high" }),
      sortResultItem({ itemId: "o", computedRank: 2, computedBucket: "low" }),
      sortResultItem({ itemId: "a", computedRank: 0, computedBucket: "top" }),
    ];
    expect([...savedOrderPositions(rows)]).toEqual([["a", 1], ["b", 2]]);
  });
});

describe("pinsFromRows (manualRank stays 0-based; a Pin is 1-based)", () => {
  it("reads manualRank 0 as position 1 and skips unpinned rows", () => {
    const rows = [
      sortResultItem({ itemId: "a", manualRank: 0 }),
      sortResultItem({ itemId: "b", manualRank: 2 }),
      sortResultItem({ itemId: "c", manualRank: null }),
    ];
    expect(pinsFromRows(rows).map((p) => [p.itemId, p.position])).toEqual([["a", 1], ["b", 3]]);
  });
});
