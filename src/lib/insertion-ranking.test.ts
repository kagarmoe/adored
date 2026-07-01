import { describe, it, expect } from "vitest";
import { latestOutcome, type ComparisonEvent } from "./insertion-ranking";

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
