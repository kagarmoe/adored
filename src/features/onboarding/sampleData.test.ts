import { describe, expect, it } from "vitest";
import {
  buildStanding,
  COMPARE_PAIR,
  SAMPLE_ITEMS,
  TRIAGE_ITEMS,
  type Tier,
} from "./sampleData";

describe("buildStanding", () => {
  const [first, second] = COMPARE_PAIR;
  const noTriage: Record<string, Tier> = {};

  it("ranks the compare winner above the passed-over item (winner = first)", () => {
    const standing = buildStanding(first.id, noTriage);
    const winnerIdx = standing.findIndex((r) => r.item.id === first.id);
    const loserIdx = standing.findIndex((r) => r.item.id === second.id);
    expect(winnerIdx).toBeLessThan(loserIdx);
    expect(standing[winnerIdx].item.id).toBe(first.id);
  });

  it("ranks the compare winner above the passed-over item (winner = second)", () => {
    const standing = buildStanding(second.id, noTriage);
    const winnerIdx = standing.findIndex((r) => r.item.id === second.id);
    const loserIdx = standing.findIndex((r) => r.item.id === first.id);
    expect(winnerIdx).toBeLessThan(loserIdx);
    expect(standing[winnerIdx].item.id).toBe(second.id);
  });

  it("crowns the winner as the most-loved (first row)", () => {
    const standing = buildStanding(second.id, noTriage);
    expect(standing[0].item.id).toBe(second.id);
    expect(standing[0].tier).toBe("love");
  });

  it("groups triaged items by tier: Love, Like above Maybe above Onward", () => {
    const [t0, t1] = TRIAGE_ITEMS;
    // t0 tapped Onward, t1 tapped Love — Love must sort ahead of Onward.
    const standing = buildStanding(first.id, { [t0.id]: "onward", [t1.id]: "love" });
    const t0Idx = standing.findIndex((r) => r.item.id === t0.id);
    const t1Idx = standing.findIndex((r) => r.item.id === t1.id);
    expect(t1Idx).toBeLessThan(t0Idx);
    expect(standing.find((r) => r.item.id === t1.id)?.tier).toBe("love");
    expect(standing.find((r) => r.item.id === t0.id)?.tier).toBe("onward");
  });

  it("includes every sample item exactly once", () => {
    const standing = buildStanding(first.id, {});
    expect(standing).toHaveLength(SAMPLE_ITEMS.length);
    const ids = new Set(standing.map((r) => r.item.id));
    expect(ids.size).toBe(SAMPLE_ITEMS.length);
  });

  it("defaults an un-triaged item to Maybe", () => {
    const [t0] = TRIAGE_ITEMS;
    const standing = buildStanding(first.id, {});
    expect(standing.find((r) => r.item.id === t0.id)?.tier).toBe("maybe");
  });
});

describe("sample images", () => {
  it("serves object images from public/onboarding (no marketplace framing)", () => {
    for (const item of SAMPLE_ITEMS) {
      expect(item.imageSrc.startsWith("/onboarding/")).toBe(true);
    }
  });
});
