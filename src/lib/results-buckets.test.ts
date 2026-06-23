import { describe, it, expect } from "vitest";
import {
  effectiveBucket,
  partitionRanked,
  isOnward,
  LOVED_BUCKETS,
  type Bucket,
} from "./results-buckets";

describe("effectiveBucket", () => {
  it("prefers the manual override over the computed bucket", () => {
    expect(effectiveBucket({ manualBucket: "low", computedBucket: "top" })).toBe("low");
    expect(effectiveBucket({ manualBucket: null, computedBucket: "high" })).toBe("high");
  });

  it("uses computedBucket when manualBucket is null", () => {
    expect(effectiveBucket({ manualBucket: null, computedBucket: "top" })).toBe("top");
    expect(effectiveBucket({ manualBucket: null, computedBucket: "low" })).toBe("low");
  });
});

describe("isOnward", () => {
  it("is true only for low", () => {
    expect(isOnward("low")).toBe(true);
    expect(isOnward("top")).toBe(false);
    expect(isOnward("high")).toBe(false);
    expect(isOnward("medium")).toBe(false);
  });
});

describe("LOVED_BUCKETS", () => {
  it("contains exactly the non-low buckets", () => {
    expect(LOVED_BUCKETS).toEqual(["top", "high", "medium"]);
  });
});

describe("partitionRanked", () => {
  it("splits low (effective) into onward, keeps the rest loved, preserving order", () => {
    const items = [
      { id: "a", manualBucket: null, computedBucket: "top" },
      { id: "b", manualBucket: "low", computedBucket: "high" }, // manual override → onward
      { id: "c", manualBucket: null, computedBucket: "medium" },
      { id: "d", manualBucket: null, computedBucket: "low" },
    ] as const;
    const { loved, onward } = partitionRanked([...items]);
    expect(loved.map((i) => i.id)).toEqual(["a", "c"]);
    expect(onward.map((i) => i.id)).toEqual(["b", "d"]);
  });

  it("keeps an item loved when a manual override lifts it out of computed low", () => {
    const items = [
      { id: "x", manualBucket: "high" as Bucket | null, computedBucket: "low" as Bucket },
      { id: "y", manualBucket: null as Bucket | null, computedBucket: "low" as Bucket },
    ];
    const { loved, onward } = partitionRanked(items);
    expect(loved.map((i) => i.id)).toEqual(["x"]);
    expect(onward.map((i) => i.id)).toEqual(["y"]);
  });

  it("returns empty groups for an empty input", () => {
    const { loved, onward } = partitionRanked([]);
    expect(loved).toEqual([]);
    expect(onward).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const items = [
      { id: "a", manualBucket: null as Bucket | null, computedBucket: "top" as Bucket },
      { id: "b", manualBucket: null as Bucket | null, computedBucket: "low" as Bucket },
    ];
    const snapshot = [...items];
    partitionRanked(items);
    expect(items).toEqual(snapshot);
  });
});
