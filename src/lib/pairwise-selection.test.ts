import { describe, expect, it } from "vitest";
import { selectNextPair } from "./pairwise-selection";
import { deriveOrder, type ComparisonEvent, type RankItem } from "./insertion-ranking";
import type { CollectionPreferenceItem, DecisionEvent, Item, RankBucket } from "@/types";

function item(id: string, createdAtMs = 0): Item {
  return {
    id, collectionId: "col-1", name: id, brand: null, style: null, color: null, material: null,
    category: null, number: null, height: null, width: null, depth: null, weight: null, unit: "in",
    status: null, notes: null, createdAt: new Date(createdAtMs), updatedAt: new Date(createdAtMs), deletedAt: null,
  };
}

function pref(itemId: string, rankBucket: RankBucket = "top"): CollectionPreferenceItem {
  return {
    id: `pref-${itemId}`, collectionId: "col-1", curatorId: "curator-1", itemId, score: 0.5,
    confidence: 0.5, rankBucket, comparisonCount: 0, orderRank: null, lastSeen: new Date(),
    createdAt: new Date(), updatedAt: new Date(),
  };
}

function compareEvent(id: string, itemAId: string, itemBId: string, result: "item_a" | "item_b" | "tie" | "skip", createdAtMs = 0): DecisionEvent {
  return { id, sessionId: "sess-1", type: "pairwise_compare", decision: { itemAId, itemBId, result }, createdAt: new Date(createdAtMs) };
}

describe("selectNextPair — the insertion engine over Love + Like", () => {
  it("returns the engine's next pair for two loved pieces", () => {
    const pair = selectNextPair({ preferences: [pref("a", "top"), pref("b", "high")], items: [item("a", 1), item("b", 2)], decisions: [] });
    expect(pair!.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("returns null once the comparable set is fully ordered", () => {
    const pair = selectNextPair({
      preferences: [pref("a"), pref("b")],
      items: [item("a", 1), item("b", 2)],
      decisions: [compareEvent("d1", "a", "b", "item_a", 10)],
    });
    expect(pair).toBeNull();
  });

  it("agrees with the engine mid-insertion (three pieces, one answer)", () => {
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    const pair = selectNextPair({ preferences: items.map((i) => pref(i.id)), items, decisions: [compareEvent("d1", "a", "b", "item_a", 10)] });
    const rankItems: RankItem[] = items.map((i) => ({ id: i.id, createdAt: i.createdAt }));
    const comparisons: ComparisonEvent[] = [{ aId: "a", bId: "b", result: "item_a", createdAt: new Date(10), id: "d1" }];
    expect(pair!.map((i) => i.id)).toEqual(deriveOrder(rankItems, comparisons).nextPair);
  });

  it("never offers a Maybe, Onward or untriaged piece", () => {
    const items = [item("a", 1), item("m", 2), item("o", 3), item("u", 4), item("b", 5)];
    const pair = selectNextPair({ preferences: [pref("a", "top"), pref("m", "medium"), pref("o", "low"), pref("b", "high")], items, decisions: [] });
    expect(pair!.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("offers nothing when fewer than two pieces are Love or Like", () => {
    expect(selectNextPair({ preferences: [pref("a", "top"), pref("m", "medium")], items: [item("a", 1), item("m", 2)], decisions: [] })).toBeNull();
  });

  it("usage-only decisions do not block a pair", () => {
    const decisions: DecisionEvent[] = [
      { id: "u1", sessionId: "sess-1", type: "usage", decision: { itemId: "a", result: "uses" }, createdAt: new Date(10) },
    ];
    const pair = selectNextPair({ preferences: [pref("a"), pref("b")], items: [item("a", 1), item("b", 2)], decisions });
    expect(pair!.map((i) => i.id)).toEqual(["b", "a"]);
  });
});
