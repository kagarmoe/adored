import { describe, expect, it } from "vitest";
import {
  compareProgress,
  triageProgress,
  usageProgress,
  workspaceMeta,
} from "./roundProgress";
import type { CollectionPreferenceItem } from "@/types";

function pref(overrides: Partial<CollectionPreferenceItem> = {}): CollectionPreferenceItem {
  return {
    id: "p1",
    collectionId: "c1",
    curatorId: "u1",
    itemId: "i1",
    score: 0.5,
    confidence: 0,
    rankBucket: "top",
    comparisonCount: 0,
    orderRank: null,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("triageProgress", () => {
  it("renders 'N of M sorted by feel' when some are decided", () => {
    expect(triageProgress(38, 100)).toBe("38 of 100 sorted by feel");
  });

  it("omits at 0 decided", () => {
    expect(triageProgress(0, 100)).toBeNull();
  });

  it("omits at 0 total items", () => {
    expect(triageProgress(0, 0)).toBeNull();
  });

  it("never renders negative/zero-total oddities even with a stray decided count", () => {
    expect(triageProgress(3, 0)).toBeNull();
  });
});

describe("usageProgress", () => {
  it("renders 'N answered' when some are answered", () => {
    expect(usageProgress(41)).toBe("41 answered");
  });

  it("omits at 0 answered", () => {
    expect(usageProgress(0)).toBeNull();
  });
});

describe("workspaceMeta", () => {
  it("renders accomplished-count framing", () => {
    expect(workspaceMeta(38, 100)).toBe("38 of 100 sorted so far");
  });

  it("omits at 0 decided", () => {
    expect(workspaceMeta(0, 100)).toBeNull();
  });

  it("omits at 0 total items", () => {
    expect(workspaceMeta(0, 0)).toBeNull();
  });
});

describe("compareProgress", () => {
  it("omits when no item has been compared anywhere", () => {
    expect(compareProgress([])).toBeNull();
    expect(compareProgress([pref({ comparisonCount: 0, confidence: 0 })])).toBeNull();
  });

  it("'taking shape' below the nearly-settled threshold (mean confidence < 0.7)", () => {
    const preferences = [
      pref({ itemId: "a", comparisonCount: 2, confidence: 0.2 }),
      pref({ itemId: "b", comparisonCount: 3, confidence: 0.3 }),
    ];
    expect(compareProgress(preferences)).toBe("Your ranking is taking shape.");
  });

  it("'nearly settled' at or above the threshold (mean confidence >= 0.7)", () => {
    const preferences = [
      pref({ itemId: "a", comparisonCount: 8, confidence: 0.8 }),
      pref({ itemId: "b", comparisonCount: 7, confidence: 0.7 }),
    ];
    expect(compareProgress(preferences)).toBe("Your ranking is nearly settled.");
  });

  it("pins the threshold boundary exactly at 0.7", () => {
    expect(compareProgress([pref({ comparisonCount: 7, confidence: 0.7 })])).toBe(
      "Your ranking is nearly settled.",
    );
    expect(
      compareProgress([pref({ comparisonCount: 6, confidence: 0.699999 })]),
    ).toBe("Your ranking is taking shape.");
  });

  it("ignores items with no comparisons when computing the mean (a lone untouched item doesn't drag it down)", () => {
    const preferences = [
      pref({ itemId: "a", comparisonCount: 10, confidence: 1 }),
      pref({ itemId: "b", comparisonCount: 0, confidence: 0 }),
    ];
    expect(compareProgress(preferences)).toBe("Your ranking is nearly settled.");
  });

  it("stability: more comparisons/confidence on the SAME compared set never demotes the message", () => {
    const rank = (msg: string | null) =>
      msg === "Your ranking is nearly settled." ? 2 : msg === "Your ranking is taking shape." ? 1 : 0;

    // Multi-item set, growing across a multi-step sweep — the same two items
    // gain comparisons/confidence over time; the message must never step
    // backwards as long as no NEW item enters the set.
    const step1 = [
      pref({ itemId: "a", comparisonCount: 1, confidence: 0.1 }),
      pref({ itemId: "b", comparisonCount: 1, confidence: 0.1 }),
    ];
    const step2 = [
      pref({ itemId: "a", comparisonCount: 4, confidence: 0.4 }),
      pref({ itemId: "b", comparisonCount: 3, confidence: 0.3 }),
    ];
    const step3 = [
      pref({ itemId: "a", comparisonCount: 8, confidence: 0.8 }),
      pref({ itemId: "b", comparisonCount: 7, confidence: 0.7 }),
    ];
    const step4 = [
      pref({ itemId: "a", comparisonCount: 10, confidence: 1 }),
      pref({ itemId: "b", comparisonCount: 10, confidence: 1 }),
    ];
    const ranks = [step1, step2, step3, step4].map((s) => rank(compareProgress(s)));
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });

  it("a newly-compared low-confidence item MAY reset 'nearly settled' to 'taking shape' — deliberate, not a monotonicity bug (spec §B)", () => {
    // One well-compared item alone is nearly settled...
    const settledAlone = [pref({ itemId: "a", comparisonCount: 10, confidence: 1 })];
    expect(compareProgress(settledAlone)).toBe("Your ranking is nearly settled.");

    // ...but a second item that just entered its FIRST comparison (real new
    // information — low confidence, freshly ranked) pulls the mean back down.
    // This demotion is intentional per the amended spec contract: stability is
    // promised only across the same already-compared set, not across the
    // arrival of new items.
    const plusNewItem = [
      ...settledAlone,
      pref({ itemId: "b", comparisonCount: 1, confidence: 0.1 }),
    ];
    expect(compareProgress(plusNewItem)).toBe("Your ranking is taking shape.");
  });
});
