import { describe, expect, it } from "vitest";
import { selectNextPair } from "./pairwise-selection";
import { deriveOrder, type ComparisonEvent, type RankItem } from "./insertion-ranking";
import type {
  CollectionPreferenceItem,
  DecisionEvent,
  Disposition,
  Item,
  RankBucket,
} from "@/types";

// Minimal Item — selectNextPair reads `id` + `createdAt` (the latter drives the
// insertion engine's deterministic sequence). The rest is filler so the shape
// type-checks. A monotonic createdAt keeps the canonical order legible per test.
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

// Minimal CollectionPreferenceItem. Compare is item-based; existing preferences
// are present only to prove they no longer gate pair eligibility.
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

// Minimal pairwise DecisionEvent — the engine reads itemAId/itemBId/result plus
// the event's id + createdAt (tie-break) via the shared ComparisonEvent mapping.
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

describe("selectNextPair — delegates to the insertion engine (Epic 0 Task 8)", () => {
  it("returns the engine's nextPair for two items with no triage preferences yet", () => {
    const items = [item("a", 1), item("b", 2)];

    const pair = selectNextPair({ preferences: [], items, decisions: [] });

    // The engine asks about these two first; assert the selector agrees exactly.
    const rankItems: RankItem[] = items.map((i) => ({ id: i.id, createdAt: i.createdAt }));
    const engineNext = deriveOrder(rankItems, [] as ComparisonEvent[]).nextPair;
    expect(engineNext).not.toBeNull();
    expect(pair).not.toBeNull();
    expect(pair!.map((i) => i.id)).toEqual(engineNext);
  });

  it("returns null once the engine has fully ordered the comparable set", () => {
    // Two items with one recorded comparison → engine places both, no pending pair.
    const items = [item("a", 1), item("b", 2)];
    const decisions = [compareEvent("d1", "a", "b", "item_a", 10)];

    const pair = selectNextPair({ preferences: [], items, decisions });

    expect(pair).toBeNull();
  });

  it("agrees with the engine mid-insertion (three items, one comparison answered)", () => {
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    const prefs = [pref("a"), pref("b"), pref("c")];
    // a vs b answered (a more loved); c is still unplaced → engine picks c's pivot.
    const decisions = [compareEvent("d1", "a", "b", "item_a", 10)];

    const pair = selectNextPair({ preferences: prefs, items, decisions });

    const rankItems: RankItem[] = items.map((i) => ({ id: i.id, createdAt: i.createdAt }));
    const comparisons: ComparisonEvent[] = [
      { aId: "a", bId: "b", result: "item_a", createdAt: new Date(10), id: "d1" },
    ];
    const engineNext = deriveOrder(rankItems, comparisons).nextPair;
    expect(engineNext).not.toBeNull();
    expect(pair).not.toBeNull();
    expect(pair!.map((i) => i.id)).toEqual(engineNext);
  });

  it("does not gate compare by triage bucket: medium/low items are still offered", () => {
    const items = [item("a", 1), item("b", 2), item("c", 3), item("d", 4)];
    const prefs = [pref("a", "top"), pref("b", "high"), pref("c", "medium"), pref("d", "low")];

    const pair = selectNextPair({ preferences: prefs, items, decisions: [] });

    expect(pair).not.toBeNull();
    // The insertion engine sees all four comparable items. It inserts a first,
    // then asks about b vs a; later medium/low items remain eligible after that.
    expect(pair!.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("usage-only decisions do not block compare eligibility", () => {
    const items = [item("a", 1), item("b", 2)];
    const decisions: DecisionEvent[] = [
      {
        id: "u1",
        sessionId: "sess-1",
        type: "usage",
        decision: { itemId: "a", result: "uses" },
        createdAt: new Date(10),
      },
      {
        id: "u2",
        sessionId: "sess-1",
        type: "usage",
        decision: { itemId: "b", result: "not_uses" },
        createdAt: new Date(11),
      },
    ];

    const pair = selectNextPair({ preferences: [], items, decisions });

    expect(pair).not.toBeNull();
    expect(pair!.map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("selectNextPair — disposition exclusion (Epic C PR1)", () => {
  it("never returns a disposed item (set_aside or deferred) as itemA or itemB", () => {
    // b is deferred and c is set_aside, so only 'a' is comparable.
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    const prefs = items.map((i) => pref(i.id));
    const disp = new Map<string, Disposition>([
      ["b", "deferred"],
      ["c", "set_aside"],
    ]);

    const pair = selectNextPair({
      preferences: prefs,
      items,
      decisions: [],
      dispositionByItemId: disp,
    });

    // Only one comparable item ('a') → no valid pair.
    expect(pair).toBeNull();
  });

  it("excludes a disposed item but still pairs the remaining comparable ones", () => {
    // Three top items; only 'c' is set_aside → 'a' and 'b' remain and must pair.
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    const prefs = items.map((i) => pref(i.id));
    const disp = new Map<string, Disposition>([["c", "set_aside"]]);

    const pair = selectNextPair({
      preferences: prefs,
      items,
      decisions: [],
      dispositionByItemId: disp,
    });

    expect(pair).not.toBeNull();
    const ids = pair!.map((i) => i.id).sort();
    expect(ids).toEqual(["a", "b"]);
    // The disposed item is on neither side.
    expect(ids).not.toContain("c");
  });

  it("control: with no dispositions, comparable items DO still pair (exclusion is not vacuous)", () => {
    // Proves the exclusion test above isn't passing only because selectNextPair
    // always returns null — without dispositions the first two items pair.
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    const prefs = items.map((i) => pref(i.id));

    const pair = selectNextPair({
      preferences: prefs,
      items,
      decisions: [],
      dispositionByItemId: new Map(),
    });

    expect(pair).not.toBeNull();
    expect(pair!.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("treats an omitted dispositionByItemId as no exclusions (back-compat)", () => {
    // Callers that never pass dispositionByItemId keep working.
    const items = [item("a", 1), item("b", 2)];
    const prefs = [pref("a"), pref("b")];

    const pair = selectNextPair({ preferences: prefs, items, decisions: [] });

    expect(pair).not.toBeNull();
    expect(pair!.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });
});
