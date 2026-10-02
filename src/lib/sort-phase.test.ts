import { describe, expect, it } from "vitest";
import type { CollectionPreferenceItem, DecisionEvent, Disposition, Item, RankBucket } from "@/types";
import { chooseSortPhase } from "./sort-phase";
import { deriveOrder } from "./insertion-ranking";

const item = (id: string, at = 0) => ({ id, createdAt: new Date(at), deletedAt: null }) as Item;
const pref = (itemId: string, rankBucket: RankBucket) => ({ itemId, rankBucket }) as CollectionPreferenceItem;
const compare = (id: string, a: string, b: string, result: "item_a" | "item_b", at: number) =>
  ({ id, sessionId: "s", type: "pairwise_compare", decision: { itemAId: a, itemBId: b, result }, createdAt: new Date(at) }) as DecisionEvent;
const run = (over: Partial<Parameters<typeof chooseSortPhase>[0]>) =>
  chooseSortPhase({ items: [], preferences: [], dispositionByItemId: new Map(), curatorDecisions: [], deferredOffered: false, ...over });

describe("chooseSortPhase (spec §4: feelings, then pairs, never interleaved)", () => {
  it("stays in feelings until every live piece is placed, with Not yet pieces last", () => {
    const phase = run({
      items: [item("a"), item("b"), item("c")],
      preferences: [pref("a", "top")],
      dispositionByItemId: new Map<string, Disposition>([["b", "deferred"]]),
    });
    expect(phase.kind).toBe("feelings");
    if (phase.kind !== "feelings") return;
    expect(phase.queue.map((e) => [e.item.id, e.deferred])).toEqual([["c", false], ["b", true]]);
    expect(phase.progress).toEqual({ done: 1, total: 2 });
  });

  it("never queues a Not mine piece and keeps it out of the denominator", () => {
    const phase = run({ items: [item("a"), item("b")], dispositionByItemId: new Map<string, Disposition>([["b", "set_aside"]]) });
    expect(phase.kind === "feelings" && phase.queue.map((e) => e.item.id)).toEqual(["a"]);
    expect(phase.progress).toEqual({ done: 0, total: 1 });
  });

  it("offers the Not yet tail until this visit has passed through it, then moves to pairs", () => {
    const base = {
      items: [item("a", 1), item("b", 2), item("c", 3)],
      preferences: [pref("a", "top"), pref("b", "high")],
      dispositionByItemId: new Map<string, Disposition>([["c", "deferred"]]),
    };
    expect(run(base).kind).toBe("feelings");
    const phase = run({ ...base, deferredOffered: true });
    expect(phase.kind === "pairs" && phase.pair.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("ignores ?phase=pairs while an active piece is still unplaced (stale tab, Bring back)", () => {
    expect(run({ items: [item("a"), item("b")], preferences: [pref("a", "top")], deferredOffered: true }).kind).toBe("feelings");
  });

  it("pairs only Love and Like, and measures progress over that set", () => {
    const phase = run({ items: [item("a", 1), item("b", 2), item("m", 3)], preferences: [pref("a", "top"), pref("b", "high"), pref("m", "medium")] });
    expect(phase.kind).toBe("pairs");
    expect(phase.progress).toEqual({ done: 1, total: 2 });
  });

  it("asks the engine's next question mid-insertion (three pieces, one answer)", () => {
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    const phase = run({ items, preferences: items.map((i) => pref(i.id, "top")), curatorDecisions: [compare("d1", "a", "b", "item_a", 10)] });
    const { nextPair } = deriveOrder(
      items.map((i) => ({ id: i.id, createdAt: i.createdAt })),
      [{ aId: "a", bId: "b", result: "item_a", createdAt: new Date(10), id: "d1" }],
    );
    expect(phase.kind === "pairs" && phase.pair.map((i) => i.id)).toEqual(nextPair);
  });

  it("usage-only decisions do not block a pair", () => {
    const usage = { id: "u1", sessionId: "s", type: "usage", decision: { itemId: "a", result: "uses" }, createdAt: new Date(10) } as DecisionEvent;
    const phase = run({ items: [item("a", 1), item("b", 2)], preferences: [pref("a", "top"), pref("b", "top")], curatorDecisions: [usage] });
    expect(phase.kind === "pairs" && phase.pair.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("is done when the comparable set is fully ordered", () => {
    const phase = run({
      items: [item("a", 1), item("b", 2)],
      preferences: [pref("a", "top"), pref("b", "top")],
      curatorDecisions: [compare("d1", "a", "b", "item_a", 10)],
    });
    expect(phase).toEqual({ kind: "done", progress: { done: 2, total: 2 } });
  });

  it("is done with nothing to pair (one loved piece, or an empty collection)", () => {
    expect(run({ items: [item("a")], preferences: [pref("a", "top")] }).kind).toBe("done");
    expect(run({}).kind).toBe("done");
  });

  it("does not count a preference for a piece that is no longer live", () => {
    expect(run({ items: [item("a")], preferences: [pref("gone", "top")] }).progress).toEqual({ done: 0, total: 1 });
  });
});
