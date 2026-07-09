import { describe, expect, it } from "vitest";
import { whatMoved, type MovedDecision } from "./what-moved";

const WSTART = 1_000_000;
const WEND = 1_060_000; // one minute window

function triage(id: string, result: "top" | "high" | "medium" | "low", at: number): MovedDecision {
  return { type: "triage", createdAt: at, decision: { itemId: id, result } };
}

function pairwise(at: number): MovedDecision {
  return {
    type: "pairwise_compare",
    createdAt: at,
    decision: { itemAId: "a", itemBId: "b", result: "item_a" },
  };
}

function usage(id: string, result: "uses" | "not_uses", at: number): MovedDecision {
  return { type: "usage", createdAt: at, decision: { itemId: id, result } };
}

describe("whatMoved — window boundaries", () => {
  it("includes a decision exactly on the start boundary", () => {
    const r = whatMoved([triage("i", "top", WSTART)], WSTART, WEND);
    expect(r.total).toBe(1);
  });

  it("includes a decision exactly on the end boundary", () => {
    const r = whatMoved([triage("i", "top", WEND)], WSTART, WEND);
    expect(r.total).toBe(1);
  });

  it("excludes a decision just before the start", () => {
    const r = whatMoved([triage("i", "top", WSTART - 1)], WSTART, WEND);
    expect(r.total).toBe(0);
  });

  it("excludes a decision just after the end", () => {
    const r = whatMoved([triage("i", "top", WEND + 1)], WSTART, WEND);
    expect(r.total).toBe(0);
  });

  it("accepts a Date createdAt as well as a millisecond number", () => {
    const withDate: MovedDecision = {
      type: "triage",
      createdAt: new Date(WSTART + 5_000),
      decision: { itemId: "d", result: "high" },
    };
    expect(whatMoved([withDate], WSTART, WEND).total).toBe(1);
  });

  it("returns an empty summary for an empty window", () => {
    const r = whatMoved([], WSTART, WEND);
    expect(r.total).toBe(0);
    expect(r.love).toBe(0);
    expect(r.like).toBe(0);
    expect(r.maybe).toBe(0);
    expect(r.onward).toBe(0);
    expect(r.ranked).toBe(0);
    expect(r.uses).toBe(0);
    expect(r.resting).toBe(0);
  });
});

describe("whatMoved — usage results", () => {
  it("counts usage results into uses/resting and total", () => {
    const r = whatMoved(
      [
        usage("1", "uses", WSTART + 1_000),
        usage("2", "uses", WSTART + 2_000),
        usage("3", "not_uses", WSTART + 3_000),
      ],
      WSTART,
      WEND,
    );
    expect(r.uses).toBe(2);
    expect(r.resting).toBe(1);
    expect(r.total).toBe(3);
    // usage doesn't leak into triage/ranked buckets
    expect(r.love).toBe(0);
    expect(r.like).toBe(0);
    expect(r.maybe).toBe(0);
    expect(r.onward).toBe(0);
    expect(r.ranked).toBe(0);
  });

  it("excludes usage results outside the window", () => {
    const r = whatMoved(
      [
        usage("in", "uses", WSTART + 1_000),
        usage("before", "uses", WSTART - 1),
        usage("after", "not_uses", WEND + 1),
      ],
      WSTART,
      WEND,
    );
    expect(r.uses).toBe(1);
    expect(r.resting).toBe(0);
    expect(r.total).toBe(1);
  });
});

describe("whatMoved — grouping by outcome", () => {
  it("groups triage decisions into love/like/maybe/onward tiers", () => {
    const r = whatMoved(
      [
        triage("1", "top", WSTART + 1_000),
        triage("2", "top", WSTART + 2_000),
        triage("3", "high", WSTART + 3_000),
        triage("4", "medium", WSTART + 4_000),
        triage("5", "low", WSTART + 5_000),
      ],
      WSTART,
      WEND,
    );
    expect(r.love).toBe(2);
    expect(r.like).toBe(1);
    expect(r.maybe).toBe(1);
    expect(r.onward).toBe(1);
    expect(r.ranked).toBe(0);
    expect(r.total).toBe(5);
  });

  it("counts pairwise decisions as ranked", () => {
    const r = whatMoved(
      [pairwise(WSTART + 1_000), pairwise(WSTART + 2_000), triage("x", "top", WSTART + 3_000)],
      WSTART,
      WEND,
    );
    expect(r.ranked).toBe(2);
    expect(r.love).toBe(1);
    expect(r.total).toBe(3);
  });

  it("only counts decisions inside the window when mixed", () => {
    const r = whatMoved(
      [
        triage("in", "top", WSTART + 1_000),
        triage("before", "high", WSTART - 5_000),
        triage("after", "medium", WEND + 5_000),
      ],
      WSTART,
      WEND,
    );
    expect(r.total).toBe(1);
    expect(r.love).toBe(1);
  });
});
