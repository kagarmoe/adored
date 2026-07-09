import { describe, it, expect } from "vitest";
import type { DecisionEvent } from "@/types";
import { deriveUsage, type UsageAnswer } from "./derive-usage";

const usage = (
  id: string,
  itemId: string,
  result: UsageAnswer,
  ms: number,
): DecisionEvent => ({
  id,
  sessionId: "session_1",
  type: "usage",
  decision: { itemId, result },
  createdAt: new Date(ms),
});

const live = (...ids: string[]) => new Set(ids);

describe("deriveUsage", () => {
  it("returns an empty map for an empty log", () => {
    expect(deriveUsage([], live("item_1"))).toEqual(new Map());
  });

  it("latest createdAt wins for the same item", () => {
    const events = [
      usage("event_a", "item_1", "not_uses", 100),
      usage("event_b", "item_1", "uses", 200),
    ];
    expect(deriveUsage(events, live("item_1"))).toEqual(
      new Map([["item_1", "uses"]]),
    );
  });

  it("breaks equal-createdAt ties by id, later id winning", () => {
    // Same createdAt; event_…b sorts after event_…a by code-unit comparison, so it wins.
    const events = [
      usage("event_b", "item_1", "uses", 100),
      usage("event_a", "item_1", "not_uses", 100),
    ];
    expect(deriveUsage(events, live("item_1"))).toEqual(
      new Map([["item_1", "uses"]]),
    );
  });

  it("ignores non-usage events entirely", () => {
    const events: DecisionEvent[] = [
      {
        id: "event_t",
        sessionId: "session_1",
        type: "triage",
        decision: { itemId: "item_1", result: "top" },
        createdAt: new Date(100),
      },
      {
        id: "event_p",
        sessionId: "session_1",
        type: "pairwise_compare",
        decision: { itemAId: "item_1", itemBId: "item_2", result: "item_a" },
        createdAt: new Date(200),
      },
      usage("event_u", "item_1", "not_uses", 150),
    ];
    expect(deriveUsage(events, live("item_1"))).toEqual(
      new Map([["item_1", "not_uses"]]),
    );
  });

  it("drops itemIds not in liveItemIds", () => {
    const events = [
      usage("event_a", "item_live", "uses", 100),
      usage("event_b", "item_purged", "not_uses", 200),
    ];
    expect(deriveUsage(events, live("item_live"))).toEqual(
      new Map([["item_live", "uses"]]),
    );
  });

  it("is independent of input order", () => {
    const a = usage("event_a", "item_1", "not_uses", 100);
    const b = usage("event_b", "item_1", "uses", 200);
    const c = usage("event_c", "item_2", "uses", 150);
    const expected = new Map<string, UsageAnswer>([
      ["item_1", "uses"],
      ["item_2", "uses"],
    ]);
    expect(deriveUsage([a, b, c], live("item_1", "item_2"))).toEqual(expected);
    expect(deriveUsage([c, b, a], live("item_1", "item_2"))).toEqual(expected);
    expect(deriveUsage([b, a, c], live("item_1", "item_2"))).toEqual(expected);
  });
});
