import { describe, it, expect } from "vitest";
import { latestOutcome, placeItem, type ComparisonEvent } from "./insertion-ranking";

const at = (s: number) => new Date(2026, 0, 1, 0, 0, s);
const cmp = (aId: string, bId: string, result: ComparisonEvent["result"], s: number, id = `e${s}`): ComparisonEvent =>
  ({ aId, bId, result, createdAt: at(s), id });

describe("latestOutcome", () => {
  it("returns unknown when the pair was never compared", () => {
    expect(latestOutcome([cmp("A", "B", "item_a", 1)], "A", "C")).toBe("unknown");
  });
  it("orients item_a to the queried x regardless of stored direction", () => {
    expect(latestOutcome([cmp("A", "B", "item_a", 1)], "A", "B")).toBe("x_more");
    expect(latestOutcome([cmp("A", "B", "item_a", 1)], "B", "A")).toBe("y_more");
  });
  it("latest by (createdAt,id) wins on contradiction", () => {
    const evs = [cmp("A", "B", "item_a", 1), cmp("B", "A", "item_a", 2)];
    // second event says B>A; oriented to x=A => y_more
    expect(latestOutcome(evs, "A", "B")).toBe("y_more");
  });
  it("breaks a same-timestamp tie by id", () => {
    const evs = [cmp("A", "B", "item_a", 5, "e_b"), cmp("A", "B", "item_b", 5, "e_a")];
    // same createdAt; id "e_b" > "e_a", so e_b (item_a => x_more) wins
    expect(latestOutcome(evs, "A", "B")).toBe("x_more");
  });
  it("passes tie and skip through", () => {
    expect(latestOutcome([cmp("A", "B", "tie", 1)], "A", "B")).toBe("tie");
    expect(latestOutcome([cmp("A", "B", "skip", 1)], "A", "B")).toBe("skip");
  });
});

describe("placeItem", () => {
  it("places into an empty list at index 0 with no comparisons", () => {
    expect(placeItem("A", [], [])).toEqual({ status: "placed", index: 0 });
  });
  it("places above the pivot when x is more loved", () => {
    // ordered [B]; A>B => A before B => index 0
    expect(placeItem("A", ["B"], [cmp("A", "B", "item_a", 1)])).toEqual({ status: "placed", index: 0 });
  });
  it("places below the pivot when x is less loved", () => {
    expect(placeItem("A", ["B"], [cmp("A", "B", "item_b", 1)])).toEqual({ status: "placed", index: 1 });
  });
  it("returns pending with the pivot when the needed comparison is missing", () => {
    expect(placeItem("A", ["B"], [])).toEqual({ status: "pending", pivotId: "B" });
  });
  it("tie places immediately after the pivot", () => {
    expect(placeItem("A", ["B"], [cmp("A", "B", "tie", 1)])).toEqual({ status: "placed", index: 1 });
  });
  it("skip on the needed pivot leaves the item skipped", () => {
    expect(placeItem("A", ["B"], [cmp("A", "B", "skip", 1)])).toEqual({ status: "skipped" });
  });
  it("respects the ceil(log2(n+1)) comparison bound (n=7 => 3)", () => {
    const ordered = ["i0", "i1", "i2", "i3", "i4", "i5", "i6"]; // most→least loved
    // X belongs at the very end: every comparison says pivot is more loved.
    const comps = ordered.map((p, k) => cmp("X", p, "item_b", k + 1));
    const res = placeItem("X", ordered, comps);
    expect(res).toEqual({ status: "placed", index: 7 });
    // Bound check: reconstruct the number of distinct pivots consulted.
    expect(distinctPivotsConsulted("X", ordered, comps)).toBeLessThanOrEqual(
      Math.ceil(Math.log2(ordered.length + 1)),
    );
  });
});

// Helper local to the test: replays the same binary search counting known-outcome pivots.
function distinctPivotsConsulted(x: string, ordered: string[], comps: ComparisonEvent[]): number {
  let lo = 0,
    hi = ordered.length,
    n = 0;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const o = latestOutcome(comps, x, ordered[mid]);
    n++;
    if (o === "x_more") hi = mid;
    else lo = mid + 1;
  }
  return n;
}

import { deriveOrder, type RankItem } from "./insertion-ranking";

const item = (id: string, s: number): RankItem => ({ id, createdAt: at(s) });

describe("deriveOrder", () => {
  it("n=0 => empty order, no next pair", () => {
    expect(deriveOrder([], [])).toEqual({ order: [], unplaced: [], nextPair: null });
  });
  it("n=1 => placed with zero comparisons", () => {
    expect(deriveOrder([item("A", 1)], [])).toEqual({ order: ["A"], unplaced: [], nextPair: null });
  });
  it("asks the next pair when a comparison is missing", () => {
    // A inserted first (index 0); B needs A vs B => pending
    const d = deriveOrder([item("A", 1), item("B", 2)], []);
    expect(d.order).toEqual(["A"]);
    expect(d.nextPair).toEqual(["B", "A"]);
  });
  it("produces a total order once all path comparisons exist", () => {
    // Canonical insert order A,B,C. A@0. B vs A: B>A => [B,A].
    // C inserts into [B,A]: binary search probes mid index 1 (A) first, then index 0 (B),
    // so C's path needs C>A and C>B => C lands at index 0 => [C,B,A].
    const comps = [cmp("B", "A", "item_a", 10), cmp("C", "A", "item_a", 11), cmp("C", "B", "item_a", 12)];
    const d = deriveOrder([item("A", 1), item("B", 2), item("C", 3)], comps);
    expect(d.order).toEqual(["C", "B", "A"]);
    expect(d.nextPair).toBeNull();
  });
  it("a later contradicting comparison flips the order deterministically", () => {
    // Same as above but a newer event says A>B.
    const comps = [
      cmp("B", "A", "item_a", 10),
      cmp("C", "A", "item_a", 11),
      cmp("C", "B", "item_a", 12),
      cmp("A", "B", "item_a", 20), // newer: A>B
    ];
    const d = deriveOrder([item("A", 1), item("B", 2), item("C", 3)], comps);
    // Newer A>B flips B vs A => A more loved. Insert order A@0; B: A>B => [A,B].
    // C inserts into [A,B]: probes index 1 (B) then index 0 (A); C>B and C>A => [C,A,B].
    expect(d.order).toEqual(["C", "A", "B"]);
  });
  it("a skipped pivot leaves that item unplaced and moves on", () => {
    const comps = [cmp("B", "A", "skip", 10)];
    const d = deriveOrder([item("A", 1), item("B", 2)], comps);
    expect(d.order).toEqual(["A"]);
    expect(d.unplaced).toEqual(["B"]);
    expect(d.nextPair).toBeNull();
  });
});
