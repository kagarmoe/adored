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
  it("puts the orderRank #1 top-bucket item first in loved (== most loved)", () => {
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
    expect(loved[0].item.id).toBe("a"); // orderRank 1 in top bucket
    expect(loved.map((r) => r.item.id)).toEqual(["a", "b", "c"]);
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

  it("carries no manual overlay — every derived row's manualBucket is null", () => {
    const prefs = [pref({ itemId: "a", rankBucket: "top", orderRank: 1 })];
    const { loved } = deriveStanding(prefs, new Map([["a", item("a", "A")]]));
    expect(loved[0].ri.manualBucket).toBeNull();
  });
});
