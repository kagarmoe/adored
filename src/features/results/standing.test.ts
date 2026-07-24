import { describe, expect, it } from "vitest";
import { deriveStanding } from "./standing";
import type { CollectionPreferenceItem, Item } from "@/types";

function pref(over: Partial<CollectionPreferenceItem>): CollectionPreferenceItem {
  return {
    id: `pref_${over.itemId}`,
    collectionId: "coll",
    curatorId: "u1",
    itemId: "i",
    score: 0,
    confidence: 0,
    rankBucket: "top",
    manualBucket: null,
    comparisonCount: 0,
    orderRank: null,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function item(id: string, name: string): Item {
  return { id, collectionId: "coll", number: 1, name, brand: null, status: "active" } as unknown as Item;
}

describe("deriveStanding — live-preference → loved/onward", () => {
  it("uses global compare order inside loved when orderRank is present", () => {
    const prefs = [
      pref({ itemId: "b", rankBucket: "top", orderRank: 2 }),
      pref({ itemId: "a", rankBucket: "top", orderRank: 1 }),
      pref({ itemId: "c", rankBucket: "high", orderRank: 1 }),
    ];
    const itemById = new Map([
      ["a", item("a", "Alpha")],
      ["b", item("b", "Bravo")],
      ["c", item("c", "Charlie")],
    ]);
    const { loved } = deriveStanding(prefs, itemById);
    expect(loved[0].item.id).toBe("a"); // orderRank 1, tie-broken by item id
    expect(loved.map((r) => r.item.id)).toEqual(["a", "c", "b"]);
  });

  it("partitions the low bucket into onward, loved keeps top/high/medium", () => {
    const prefs = [
      pref({ itemId: "keep", rankBucket: "medium", orderRank: 1 }),
      pref({ itemId: "go", rankBucket: "low", orderRank: 1 }),
    ];
    const itemById = new Map([
      ["keep", item("keep", "Keeper")],
      ["go", item("go", "Onward")],
    ]);
    const { loved, onward } = deriveStanding(prefs, itemById);
    expect(loved.map((r) => r.item.id)).toEqual(["keep"]);
    expect(onward.map((r) => r.item.id)).toEqual(["go"]);
  });

  it("drops preferences whose item is missing from the lookup", () => {
    const prefs = [pref({ itemId: "ghost", rankBucket: "top", orderRank: 1 })];
    const { loved, onward } = deriveStanding(prefs, new Map());
    expect(loved).toHaveLength(0);
    expect(onward).toHaveLength(0);
  });

  it("threads the live manual overlay onto each row (null when no hand-bin)", () => {
    const prefs = [pref({ itemId: "a", rankBucket: "top", orderRank: 1 })];
    const { loved } = deriveStanding(prefs, new Map([["a", item("a", "A")]]));
    expect(loved[0].ri.manualBucket).toBeNull();
  });

  it("a manual bin that disagrees with rankBucket WINS the loved/onward partition (purses-xxo7)", () => {
    // rankBucket=low would land in onward; the hand-set top overlay pulls it into
    // loved (effectiveBucket = manualBucket ?? rankBucket). And a loved item hand-set
    // to low drops to onward. The bin is a partition, so a rebinned item joins its
    // new partition at the END (computedRank still follows the raw rankBucket order).
    const prefs = [
      pref({ itemId: "pulled-up", rankBucket: "low", manualBucket: "top", orderRank: null }),
      pref({ itemId: "real-loved", rankBucket: "high", manualBucket: null, orderRank: null }),
      pref({ itemId: "dropped", rankBucket: "top", manualBucket: "low", orderRank: null }),
    ];
    const itemById = new Map([
      ["pulled-up", item("pulled-up", "Up")],
      ["real-loved", item("real-loved", "Loved")],
      ["dropped", item("dropped", "Down")],
    ]);
    const { loved, onward } = deriveStanding(prefs, itemById);
    expect(loved.map((r) => r.item.id)).toEqual(["real-loved", "pulled-up"]);
    expect(onward.map((r) => r.item.id)).toEqual(["dropped"]);
  });
});
