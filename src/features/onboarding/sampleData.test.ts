import { describe, expect, it } from "vitest";
import {
  buildStanding,
  COMPARE_PAIR,
  RESULT_TO_TIER,
  SAMPLE_ITEMS,
  toItem,
  TRIAGE_ITEMS,
  type CompareOutcome,
  type Tier,
  type TriageOutcome,
} from "./sampleData";

// Wrap plain tier choices as typed triage outcomes (brief helper).
const tiers = (t: Record<string, Tier>): Record<string, TriageOutcome> =>
  Object.fromEntries(
    Object.entries(t).map(([id, tier]) => [id, { kind: "tier", tier } as TriageOutcome]),
  );

describe("buildStanding", () => {
  it("win: winner love, passed-over like, at the top", () => {
    const s = buildStanding(
      { kind: "win", winnerId: "clock" },
      tiers({ vase: "maybe", books: "maybe", cushion: "maybe" }),
    );
    // clock is the winner (love) and crowns the ranking; armchair is passed over (like).
    expect(s.ranked[0]).toEqual({ item: SAMPLE_ITEMS[1], tier: "love" });
    expect(s.ranked[1]).toEqual({ item: SAMPLE_ITEMS[0], tier: "like" });
    expect(s.deferred).toEqual([]);
    expect(s.setAside).toEqual([]);
  });

  it("tie: both love, display order kept", () => {
    const s = buildStanding({ kind: "tie" }, tiers({ vase: "maybe", books: "like", cushion: "love" }));
    expect(s.ranked[0]).toEqual({ item: SAMPLE_ITEMS[0], tier: "love" });
    expect(s.ranked[1]).toEqual({ item: SAMPLE_ITEMS[1], tier: "love" });
  });

  it("skip: both like, display order kept", () => {
    const s = buildStanding({ kind: "skip" }, tiers({ vase: "maybe", books: "maybe", cushion: "maybe" }));
    // Neither pair item wins; both drop to "like", keeping displayed pair order.
    expect(s.ranked[0]).toEqual({ item: SAMPLE_ITEMS[0], tier: "like" });
    expect(s.ranked[1]).toEqual({ item: SAMPLE_ITEMS[1], tier: "like" });
  });

  it("triage tiers order remaining rows love>like>maybe>onward", () => {
    const s = buildStanding(
      { kind: "win", winnerId: "armchair" },
      tiers({ vase: "love", books: "maybe", cushion: "onward" }),
    );
    // love: armchair (winner, idx0), vase (idx2); like: clock (passed over, idx1);
    // maybe: books (idx3); onward: cushion (idx4). Within a tier, display order holds.
    expect(s.ranked.map((r) => r.item.id)).toEqual(["armchair", "vase", "clock", "books", "cushion"]);
    expect(s.ranked.map((r) => r.tier)).toEqual(["love", "love", "like", "maybe", "onward"]);
  });

  it("defaults an un-triaged triage item to maybe", () => {
    const s = buildStanding({ kind: "win", winnerId: "armchair" }, {});
    expect(s.ranked.find((r) => r.item.id === "vase")?.tier).toBe("maybe");
    expect(s.ranked.find((r) => r.item.id === "books")?.tier).toBe("maybe");
    expect(s.ranked.find((r) => r.item.id === "cushion")?.tier).toBe("maybe");
  });

  it("deferred leaves the ranking for the deferred group", () => {
    const s = buildStanding(
      { kind: "win", winnerId: "armchair" },
      { ...tiers({ vase: "love", books: "like" }), cushion: { kind: "deferred" } },
    );
    expect(s.deferred.map((i) => i.id)).toEqual(["cushion"]);
    expect(s.ranked.map((r) => r.item.id)).not.toContain("cushion");
    expect(s.setAside).toEqual([]);
  });

  it("setAside leaves the ranking for the set-aside group", () => {
    const s = buildStanding(
      { kind: "win", winnerId: "armchair" },
      { ...tiers({ vase: "love", books: "like" }), cushion: { kind: "setAside" } },
    );
    expect(s.setAside.map((i) => i.id)).toEqual(["cushion"]);
    expect(s.ranked.map((r) => r.item.id)).not.toContain("cushion");
    expect(s.deferred).toEqual([]);
  });

  it("all triage items deferred/set aside still ranks the compare pair", () => {
    const s = buildStanding({ kind: "tie" }, {
      vase: { kind: "deferred" },
      books: { kind: "setAside" },
      cushion: { kind: "deferred" },
    });
    // The compare pair always ranks, so ranked is never empty here — the empty-ranked
    // "all decided" (hero omitted) variant is a render-layer concern (Task 10), not
    // reachable through buildStanding because win/tie/skip all rank the pair.
    expect(s.ranked.map((r) => r.item.id)).toEqual(["armchair", "clock"]);
    expect(s.ranked.every((r) => r.tier === "love")).toBe(true);
    expect(s.ranked[0]).toBeDefined();
    expect(s.deferred.map((i) => i.id)).toEqual(["vase", "cushion"]);
    expect(s.setAside.map((i) => i.id)).toEqual(["books"]);
  });

  it("keeps compare and triage sets disjoint (each sample item appears once)", () => {
    const s = buildStanding({ kind: "win", winnerId: "armchair" }, tiers({ vase: "love", books: "like", cushion: "maybe" }));
    const all = [...s.ranked.map((r) => r.item.id), ...s.deferred.map((i) => i.id), ...s.setAside.map((i) => i.id)];
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(SAMPLE_ITEMS.map((i) => i.id)));
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

  it("triage items are vase, books, cushion (the not-yours item third)", () => {
    expect(TRIAGE_ITEMS.map((i) => i.id)).toEqual(["vase", "books", "cushion"]);
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
