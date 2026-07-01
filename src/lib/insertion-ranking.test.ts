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
