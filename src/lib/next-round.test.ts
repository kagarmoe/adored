import { describe, expect, it } from "vitest";
import { recommendNextRound } from "./next-round";
import { ROUND_COPY } from "@/features/sorting/roundCopy";
import type {
  CollectionPreferenceItem,
  DecisionEvent,
  Item,
  RankBucket,
} from "@/types";

function item(id: string, createdAtMs = 0): Item {
  return {
    id,
    collectionId: "col-1",
    name: id,
    brand: null,
    style: null,
    color: null,
    material: null,
    category: null,
    number: null,
    height: null,
    width: null,
    depth: null,
    weight: null,
    unit: "in",
    status: null,
    notes: null,
    createdAt: new Date(createdAtMs),
    updatedAt: new Date(createdAtMs),
    deletedAt: null,
  };
}

function pref(itemId: string, rankBucket: RankBucket = "top"): CollectionPreferenceItem {
  return {
    id: `pref-${itemId}`,
    collectionId: "col-1",
    curatorId: "curator-1",
    itemId,
    score: 0.5,
    confidence: 0.5,
    rankBucket,
    comparisonCount: 0,
    orderRank: null,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function compareEvent(
  id: string,
  itemAId: string,
  itemBId: string,
  result: "item_a" | "item_b" | "tie" | "skip",
  createdAtMs = 0,
): DecisionEvent {
  return {
    id,
    sessionId: "sess-1",
    type: "pairwise_compare",
    decision: { itemAId, itemBId, result },
    createdAt: new Date(createdAtMs),
  };
}

function usageEvent(
  id: string,
  itemId: string,
  result: "uses" | "not_uses" = "uses",
  createdAtMs = 0,
): DecisionEvent {
  return {
    id,
    sessionId: "sess-1",
    type: "usage",
    decision: { itemId, result },
    createdAt: new Date(createdAtMs),
  };
}

describe("recommendNextRound — ladder", () => {
  it("recommends triage when untriaged items remain (no whenUsageDemoted)", () => {
    // 'b' has no preference → still untriaged. Triage wins the top of the ladder.
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a")];

    const { primary, whenUsageDemoted } = recommendNextRound({
      items,
      preferences,
      curatorDecisions: [],
    });

    expect(primary.kind).toBe("triage");
    expect(primary.label).toBe("Quick triage");
    expect(whenUsageDemoted).toBeUndefined();
  });

  it("recommends usage when everything is triaged but usage is still unknown, and returns whenUsageDemoted", () => {
    // Both triaged; usage unknown for both → usage is primary.
    // Demoted ladder skips usage → a pair still pends → compare.
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a", "top"), pref("b", "high")];

    const { primary, whenUsageDemoted } = recommendNextRound({
      items,
      preferences,
      curatorDecisions: [],
    });

    expect(primary.kind).toBe("usage");
    expect(whenUsageDemoted).toBeDefined();
    // Demotion never re-promotes usage: skip it → compare (a comparable pair remains).
    expect(whenUsageDemoted?.kind).toBe("compare");
  });

  it("recommends compare when triage + usage are known and a comparable pair remains (no whenUsageDemoted)", () => {
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a", "top"), pref("b", "high")];
    // Usage answered for both → usage queue empty → usage falls through to compare.
    const curatorDecisions = [usageEvent("u-a", "a"), usageEvent("u-b", "b")];

    const { primary, whenUsageDemoted } = recommendNextRound({
      items,
      preferences,
      curatorDecisions,
    });

    expect(primary.kind).toBe("compare");
    expect(primary.label).toBe("Compare");
    expect(whenUsageDemoted).toBeUndefined();
  });

  it("recommends compare without requiring top/high buckets once the ladder reaches compare", () => {
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a", "medium"), pref("b", "low")];
    const curatorDecisions = [usageEvent("u-a", "a"), usageEvent("u-b", "b")];

    const { primary } = recommendNextRound({
      items,
      preferences,
      curatorDecisions,
    });

    expect(primary.kind).toBe("compare");
  });

  it("recommends decide when triage + usage are known and the comparable set is fully ordered (no whenUsageDemoted)", () => {
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a", "top"), pref("b", "high")];
    // One comparison orders the pair → no pending pair. The compare lives in the
    // curator log (selection's input); the session subset mirrors it (one session).
    const compare = compareEvent("d1", "a", "b", "item_a", 10);
    const curatorDecisions = [usageEvent("u-a", "a"), usageEvent("u-b", "b"), compare];
    const decisions = [compare];

    const { primary, whenUsageDemoted } = recommendNextRound({
      items,
      preferences,
      decisions,
      curatorDecisions,
    });

    expect(primary.kind).toBe("decide");
    expect(whenUsageDemoted).toBeUndefined();
  });

  it("selects compare from the CURATOR-WIDE log: a pair ordered in a prior session is not re-recommended (§7.3)", () => {
    // Both triaged + usage-known so the ladder reaches compare/decide. The a↔b
    // comparison was made in a PRIOR session, so it lives in the curator log but NOT
    // in this session's log (the empty session subset selection used to read).
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a", "top"), pref("b", "high")];
    const priorCompare: DecisionEvent = {
      id: "prior",
      sessionId: "sess-0",
      type: "pairwise_compare",
      decision: { itemAId: "a", itemBId: "b", result: "item_a" },
      createdAt: new Date(10),
    };
    const curatorDecisions = [usageEvent("u-a", "a"), usageEvent("u-b", "b"), priorCompare];

    const { primary } = recommendNextRound({
      items,
      preferences,
      curatorDecisions,
    });
    // Curator-wide: a↔b is already ordered → nothing left to compare → decide.
    expect(primary.kind).toBe("decide");

    // Contrast: the OLD §7.3 quirk read the session subset. Feed selection a log
    // WITHOUT the prior compare (what the session-scoped input was) and the pair is
    // unordered again → it would re-recommend compare.
    const { primary: asIfSessionScoped } = recommendNextRound({
      items,
      preferences,
      curatorDecisions: [usageEvent("u-a", "a"), usageEvent("u-b", "b")],
    });
    expect(asIfSessionScoped.kind).toBe("compare");
  });

  it("recommends decide when there are no items at all", () => {
    const { primary, whenUsageDemoted } = recommendNextRound({
      items: [],
      preferences: [],
      curatorDecisions: [],
    });
    expect(primary.kind).toBe("decide");
    expect(whenUsageDemoted).toBeUndefined();
  });

  it("demotion falls to decide (never usage) when no comparable pair remains", () => {
    // A single triaged item with usage unknown → usage is primary. Skipping usage
    // leaves one lonely item: no pair → decide. Usage is NEVER re-promoted.
    const items = [item("a", 1)];
    const preferences = [pref("a", "top")];

    const { primary, whenUsageDemoted } = recommendNextRound({
      items,
      preferences,
      curatorDecisions: [],
    });

    expect(primary.kind).toBe("usage");
    expect(whenUsageDemoted?.kind).toBe("decide");
    expect(whenUsageDemoted?.kind).not.toBe("usage");
  });

  it("skips a set-aside item rather than recommending triage or usage for it", () => {
    // 'b' is untriaged but set aside → neither a triage nor a usage candidate; 'a'
    // triaged + usage-known and alone → no pair → decide.
    const items = [item("a", 1), item("b", 2)];
    const preferences = [pref("a", "top")];
    const curatorDecisions = [usageEvent("u-a", "a")];
    const dispositionByItemId = new Map<string, "set_aside" | "deferred">([["b", "set_aside"]]);

    const { primary } = recommendNextRound({
      items,
      preferences,
      curatorDecisions,
      dispositionByItemId,
    });

    expect(primary.kind).toBe("decide");
  });
});

describe("recommendNextRound — usage card copy (TONE)", () => {
  it("labels the usage card via ROUND_COPY.usage.name (one home) with verbatim description + cta", () => {
    const items = [item("a", 1)];
    const preferences = [pref("a", "top")];

    const { primary } = recommendNextRound({
      items,
      preferences,
      curatorDecisions: [],
    });

    expect(primary.kind).toBe("usage");
    expect(primary.label).toBe(ROUND_COPY.usage.name);
    expect(primary.description).toBe(
      "An easy pass — just whether each piece is in your life right now.",
    );
    expect(primary.cta).toBe("Begin");
  });
});
