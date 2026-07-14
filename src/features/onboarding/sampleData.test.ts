import { describe, expect, it } from "vitest";
import {
  buildStanding,
  buildTriageStanding,
  comparePairsFor,
  COMPARE_PAIR,
  RESULT_TO_TIER,
  SAMPLE_ITEMS,
  toItem,
  TRIAGE_ITEMS,
  type CompareOutcome,
  type CompareRoundResult,
  type Tier,
  type TriageOutcome,
} from "./sampleData";

// Wrap plain tier choices as typed triage outcomes (brief helper).
const tiers = (t: Record<string, Tier>): Record<string, TriageOutcome> =>
  Object.fromEntries(
    Object.entries(t).map(([id, tier]) => [id, { kind: "tier", tier } as TriageOutcome]),
  );

const compared = (
  itemAId: string,
  itemBId: string,
  outcome: CompareOutcome,
): CompareRoundResult => ({ itemAId, itemBId, outcome });

describe("buildStanding", () => {
  it("win: winner rises while triage tiers stay attached", () => {
    const s = buildStanding(
      [compared("armchair", "clock", { kind: "win", winnerId: "clock" })],
      tiers({ armchair: "maybe", clock: "maybe", vase: "maybe" }),
    );
    expect(s.ranked.map((r) => r.item.id)).toEqual(["clock", "armchair", "vase"]);
    expect(s.ranked.map((r) => r.tier)).toEqual(["maybe", "maybe", "maybe"]);
    expect(s.deferred).toEqual([]);
    expect(s.setAside).toEqual([]);
  });

  it("tie: both pieces get the same compare weight, then triage order breaks the tie", () => {
    const s = buildStanding(
      [compared("armchair", "clock", { kind: "tie" })],
      tiers({ armchair: "maybe", clock: "like", vase: "love" }),
    );
    expect(s.ranked.map((r) => r.item.id)).toEqual(["clock", "armchair", "vase"]);
    expect(s.ranked.map((r) => r.tier)).toEqual(["like", "maybe", "love"]);
  });

  it("skip: compare adds no weight, so triage standing is kept", () => {
    const s = buildStanding(
      [compared("armchair", "clock", { kind: "skip" })],
      tiers({ armchair: "maybe", clock: "maybe", vase: "maybe" }),
    );
    expect(s.ranked.map((r) => r.item.id)).toEqual(["armchair", "clock", "vase"]);
    expect(s.ranked.map((r) => r.tier)).toEqual(["maybe", "maybe", "maybe"]);
  });

  it("compare rounds reorder ranked rows after triage", () => {
    const s = buildStanding(
      [
        compared("armchair", "clock", { kind: "win", winnerId: "clock" }),
        compared("armchair", "vase", { kind: "win", winnerId: "vase" }),
        compared("clock", "vase", { kind: "win", winnerId: "vase" }),
      ],
      tiers({ armchair: "love", clock: "love", vase: "love" }),
    );
    expect(s.ranked.map((r) => r.item.id)).toEqual(["vase", "clock", "armchair"]);
    expect(s.ranked.map((r) => r.tier)).toEqual(["love", "love", "love"]);
  });

  it("defaults an un-triaged triage item to maybe", () => {
    const s = buildStanding([compared("armchair", "clock", { kind: "win", winnerId: "armchair" })], {});
    expect(s.ranked.find((r) => r.item.id === "vase")?.tier).toBe("maybe");
  });

  it("deferred leaves the ranking for the deferred group", () => {
    const s = buildStanding(
      [compared("armchair", "clock", { kind: "win", winnerId: "armchair" })],
      { ...tiers({ armchair: "love", clock: "like" }), vase: { kind: "deferred" } },
    );
    expect(s.deferred.map((i) => i.id)).toEqual(["vase"]);
    expect(s.ranked.map((r) => r.item.id)).not.toContain("vase");
    expect(s.setAside).toEqual([]);
  });

  it("setAside leaves the ranking for the set-aside group", () => {
    const s = buildStanding(
      [compared("armchair", "clock", { kind: "win", winnerId: "armchair" })],
      { ...tiers({ armchair: "love", clock: "like" }), vase: { kind: "setAside" } },
    );
    expect(s.setAside.map((i) => i.id)).toEqual(["vase"]);
    expect(s.ranked.map((r) => r.item.id)).not.toContain("vase");
    expect(s.deferred).toEqual([]);
  });

  it("all triage items deferred/set aside leaves no ranked hero", () => {
    const s = buildStanding(
      [compared("armchair", "clock", { kind: "tie" })],
      {
        armchair: { kind: "deferred" },
        clock: { kind: "setAside" },
        vase: { kind: "deferred" },
      },
    );
    expect(s.ranked).toEqual([]);
    expect(s.deferred.map((i) => i.id)).toEqual(["armchair", "vase"]);
    expect(s.setAside.map((i) => i.id)).toEqual(["clock"]);
  });

  it("keeps each demonstrated sample item represented once", () => {
    const s = buildStanding(
      [compared("armchair", "clock", { kind: "win", winnerId: "armchair" })],
      tiers({ armchair: "love", clock: "like", vase: "maybe" }),
    );
    const all = [...s.ranked.map((r) => r.item.id), ...s.deferred.map((i) => i.id), ...s.setAside.map((i) => i.id)];
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(TRIAGE_ITEMS.map((i) => i.id)));
  });
});

describe("buildTriageStanding", () => {
  it("shows the first standing before usage or compare", () => {
    const s = buildTriageStanding(tiers({ armchair: "like", clock: "love", vase: "maybe" }));
    expect(s.ranked.map((r) => r.item.id)).toEqual(["clock", "armchair", "vase"]);
    expect(s.ranked.map((r) => r.tier)).toEqual(["love", "like", "maybe"]);
  });
});

describe("comparePairsFor", () => {
  it("compares every ranked item against every other ranked item", () => {
    const standing = buildTriageStanding(tiers({ armchair: "love", clock: "love", vase: "love" }));
    expect(comparePairsFor(standing).map((pair) => pair.map((item) => item.id))).toEqual([
      ["armchair", "clock"],
      ["armchair", "vase"],
      ["clock", "vase"],
    ]);
  });

  it("omits deferred and set-aside items from compare pairs", () => {
    const standing = buildTriageStanding({
      armchair: { kind: "deferred" },
      clock: { kind: "tier", tier: "love" },
      vase: { kind: "setAside" },
    });
    expect(comparePairsFor(standing)).toEqual([]);
  });
});

describe("toItem", () => {
  it("toItem fabricates a complete Item (satisfies the type, fixed dates)", () => {
    const item = toItem(SAMPLE_ITEMS[0]);
    expect(item.id).toBe("armchair");
    expect(item.name).toBe(SAMPLE_ITEMS[0].name);
    expect(item.collectionId).toBe("welcome-demo");
  });

  it("fills every metadata field with null and uses fixed unit/dates", () => {
    const item = toItem(SAMPLE_ITEMS[4]); // the renamed cushion
    expect(item.unit).toBe("in");
    expect(item.createdAt).toEqual(new Date(0));
    expect(item.updatedAt).toEqual(new Date(0));
    expect(item.deletedAt).toBeNull();
    const nullFields = [
      "brand",
      "style",
      "color",
      "material",
      "category",
      "number",
      "height",
      "width",
      "depth",
      "weight",
      "status",
      "notes",
      "story",
    ] as const;
    for (const f of nullFields) {
      expect(item[f]).toBeNull();
    }
  });
});

describe("RESULT_TO_TIER", () => {
  it("maps scoring result buckets to demo tiers", () => {
    const expected: Record<"top" | "high" | "medium" | "low", Tier> = {
      top: "love",
      high: "like",
      medium: "maybe",
      low: "onward",
    };
    expect(RESULT_TO_TIER).toEqual(expected);
  });
});

describe("sample content", () => {
  it("orders items [armchair, clock, vase, books, cushion]", () => {
    expect(SAMPLE_ITEMS.map((i) => i.id)).toEqual(["armchair", "clock", "vase", "books", "cushion"]);
  });

  it("keeps the compare pair as armchair and clock", () => {
    expect(COMPARE_PAIR.map((i) => i.id)).toEqual(["armchair", "clock"]);
  });

  it("triage items are the demonstrated sample collection", () => {
    expect(TRIAGE_ITEMS.map((i) => i.id)).toEqual(["armchair", "clock", "vase"]);
  });

  it("renames the cushion to 'The kid's microphone cushion' on the same image", () => {
    const cushion = SAMPLE_ITEMS.find((i) => i.id === "cushion");
    expect(cushion?.name).toBe("The kid's microphone cushion");
    expect(cushion?.imageSrc).toBe("/onboarding/microphone-cushion.webp");
  });

  it("serves object images from public/onboarding (no marketplace framing)", () => {
    for (const item of SAMPLE_ITEMS) {
      expect(item.imageSrc.startsWith("/onboarding/")).toBe(true);
    }
  });
});

// Type-level guard: the outcome unions must stay exhaustive for later beats.
const _outcomes: (CompareOutcome | TriageOutcome)[] = [
  { kind: "win", winnerId: "armchair" },
  { kind: "tie" },
  { kind: "skip" },
  { kind: "tier", tier: "love" },
  { kind: "deferred" },
  { kind: "setAside" },
];
void _outcomes;
