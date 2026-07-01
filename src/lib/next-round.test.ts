import { describe, expect, it } from "vitest";
import { recommendNextRound } from "./next-round";
import type {
  CollectionPreferenceItem,
  DecisionEvent,
  Item,
  RankBucket,
} from "@/types";

function item(id: string, createdAtMs = 0): Item {
  return {
    id,
    collectionId: "col-1",
    name: id,
    brand: null,
    style: null,
    color: null,
    material: null,
    category: null,
    number: null,
    height: null,
    width: null,
    depth: null,
    weight: null,
    unit: "in",
    status: null,
    notes: null,
    createdAt: new Date(createdAtMs),
    updatedAt: new Date(createdAtMs),
    deletedAt: null,
  };
}

function pref(itemId: string, rankBucket: RankBucket = "top"): CollectionPreferenceItem {
  return {
    id: `pref-${itemId}`,
    collectionId: "col-1",
    curatorId: "curator-1",
    itemId,
    score: 0.5,
    confidence: 0.5,
    rankBucket,
    comparisonCount: 0,
    orderRank: null,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function compareEvent(
  id: string,
  itemAId: string,
  itemBId: string,
  result: "item_a" | "item_b" | "tie" | "skip",
  createdAtMs = 0,
): DecisionEvent {
  return {
    id,
    sessionId: "sess-1",
    type: "pairwise_compare",
    decision: { itemAId, itemBId, result },
    createdAt: new Date(createdAtMs),
  };
}

describe("recommendNextRound", () => {
  it("recommends triage when untriaged items remain", () => {
    // 'b' has no preference → still untriaged.
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a")];

    const next = recommendNextRound({ items, preferences, decisions: [] });

    expect(next.kind).toBe("triage");
    expect(next.label).toBe("Quick triage");
  });

  it("recommends compare when everything is triaged but a rankable pair remains", () => {
    // Both triaged into rankable buckets (top/high), no comparison yet → a pair pends.
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a", "top"), pref("b", "high")];

    const next = recommendNextRound({ items, preferences, decisions: [] });

    expect(next.kind).toBe("compare");
    expect(next.label).toBe("Refine the top tier");
  });

  it("recommends decide when triage is done and the rankable set is fully ordered", () => {
    // Both triaged, one comparison orders the pair → no pending pair, nothing untriaged.
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a", "top"), pref("b", "high")];
    const decisions = [compareEvent("d1", "a", "b", "item_a", 10)];

    const next = recommendNextRound({ items, preferences, decisions });

    expect(next.kind).toBe("decide");
  });

  it("recommends decide when there are no items at all", () => {
    const next = recommendNextRound({ items: [], preferences: [], decisions: [] });
    expect(next.kind).toBe("decide");
  });

  it("skips a set-aside item rather than recommending triage for it", () => {
    // 'b' is untriaged but set aside → not a triage candidate; 'a' fully ordered alone.
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a", "top")];
    const dispositionByItemId = new Map<string, "set_aside" | "deferred">([["b", "set_aside"]]);

    const next = recommendNextRound({ items, preferences, decisions: [], dispositionByItemId });

    // 'a' alone is rankable but a single item has no pair → decide.
    expect(next.kind).toBe("decide");
  });

  it("emits no numeric denominator, percentage, or rate in any copy field", () => {
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a")];
    const next = recommendNextRound({ items, preferences, decisions: [] });

    const copy = `${next.label} ${next.description} ${next.cta}`;
    expect(copy).not.toMatch(/\bof\s+\d/i);
    expect(copy).not.toMatch(/%/);
    expect(copy).not.toMatch(/per min|rate|coverage|remaining/i);
  });
});
