import { describe, expect, it } from "vitest";
import { selectNextPair } from "./pairwise-selection";
import type { CollectionPreferenceItem, Disposition, Item } from "@/types";

// Minimal Item — only `id` is read by selectNextPair; the rest is filler so the
// shape type-checks. A factory keeps each test's intent (which ids exist) legible.
function item(id: string): Item {
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
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

// Minimal CollectionPreferenceItem — selectNextPair reads only `itemId` + `score`.
function pref(itemId: string, score: number): CollectionPreferenceItem {
  return {
    id: `pref-${itemId}`,
    collectionId: "col-1",
    curatorId: "curator-1",
    itemId,
    score,
    confidence: 0.5,
    rankBucket: "medium",
    comparisonCount: 0,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("selectNextPair — disposition exclusion (Epic C PR1)", () => {
  it("never returns a disposed item (set_aside or deferred) as itemA or itemB", () => {
    // a > b > c by score; b is deferred and c is set_aside, so only 'a' is eligible.
    const items = [item("a"), item("b"), item("c")];
    const prefs = items.map((i, n) => pref(i.id, 0.9 - n * 0.1));
    const disp = new Map<string, Disposition>([
      ["b", "deferred"],
      ["c", "set_aside"],
    ]);

    const pair = selectNextPair({
      preferences: prefs,
      items,
      decidedPairs: new Set(),
      dispositionByItemId: disp,
    });

    // Only one eligible item ('a') → no valid pair.
    expect(pair).toBeNull();
  });

  it("excludes a disposed item but still pairs the remaining eligible ones", () => {
    // Three items; only 'c' is set_aside → 'a' and 'b' remain and must pair.
    const items = [item("a"), item("b"), item("c")];
    const prefs = items.map((i, n) => pref(i.id, 0.9 - n * 0.1));
    const disp = new Map<string, Disposition>([["c", "set_aside"]]);

    const pair = selectNextPair({
      preferences: prefs,
      items,
      decidedPairs: new Set(),
      dispositionByItemId: disp,
    });

    expect(pair).not.toBeNull();
    const ids = pair!.map((i) => i.id).sort();
    expect(ids).toEqual(["a", "b"]);
    // The disposed item is on neither side.
    expect(ids).not.toContain("c");
  });

  it("control: with no dispositions, eligible items DO still pair (exclusion is not vacuous)", () => {
    // Proves the exclusion test above isn't passing only because selectNextPair
    // always returns null — without dispositions the top two items pair.
    const items = [item("a"), item("b"), item("c")];
    const prefs = items.map((i, n) => pref(i.id, 0.9 - n * 0.1));

    const pair = selectNextPair({
      preferences: prefs,
      items,
      decidedPairs: new Set(),
      dispositionByItemId: new Map(),
    });

    expect(pair).not.toBeNull();
    expect(pair!.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("treats an omitted dispositionByItemId as no exclusions (back-compat)", () => {
    // Existing callers/tests that never pass dispositionByItemId keep working.
    const items = [item("a"), item("b")];
    const prefs = [pref("a", 0.9), pref("b", 0.5)];

    const pair = selectNextPair({
      preferences: prefs,
      items,
      decidedPairs: new Set(),
    });

    expect(pair).not.toBeNull();
    expect(pair!.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });
});
