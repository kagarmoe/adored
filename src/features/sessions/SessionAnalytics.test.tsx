// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SessionAnalytics } from "./SessionAnalytics";
import type { CollectionPreferenceItem, DecisionEvent } from "@/types";

// TONE reframe (Epic 4d, bead purses-gjr): this component is a gentle reflection,
// NOT a metrics panel. These tests assert the affirming render AND guard against
// the retired denominator/percentage/rate framings ever coming back.

function pref(over: Partial<CollectionPreferenceItem>): CollectionPreferenceItem {
  return {
    id: "pref",
    collectionId: "coll",
    curatorId: "cur",
    itemId: "item",
    score: 0,
    confidence: 0,
    rankBucket: "low",
    comparisonCount: 0,
    orderRank: null,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function decision(type: DecisionEvent["type"]): DecisionEvent {
  return {
    id: "dec",
    sessionId: "sess",
    type,
    decision:
      type === "triage"
        ? { itemId: "i", result: "top" }
        : { itemAId: "a", itemBId: "b", result: "item_a" },
    createdAt: new Date(),
  };
}

describe("SessionAnalytics", () => {
  it("affirms the tiers the curator has discovered, without a metrics panel", () => {
    const preferences: CollectionPreferenceItem[] = [
      pref({ id: "a", rankBucket: "top" }),
      pref({ id: "b", rankBucket: "high" }),
    ];
    const decisions: DecisionEvent[] = [decision("triage"), decision("pairwise_compare")];

    render(
      <SessionAnalytics
        preferences={preferences}
        decisions={decisions}
        totalItems={8}
        sessionCreatedAt={new Date("2026-06-22T12:00:00Z")}
      />
    );

    expect(screen.getByText("Where things stand")).toBeInTheDocument();
    // Discovered tiers surface as calm labels, not counts.
    expect(screen.getByText("Love")).toBeInTheDocument();
    expect(screen.getByText("Like")).toBeInTheDocument();
  });

  it("renders a gentle empty state when nothing is sorted yet", () => {
    render(
      <SessionAnalytics
        preferences={[]}
        decisions={[]}
        totalItems={0}
        sessionCreatedAt={new Date("2026-06-22T12:10:00Z")}
      />
    );

    expect(screen.getByText(/nothing sorted just yet/i)).toBeInTheDocument();
  });

  it("renders NO denominator, percentage, rate, or coverage framing (TONE guard)", () => {
    const preferences: CollectionPreferenceItem[] = [
      pref({ id: "a", rankBucket: "top", confidence: 0.9, comparisonCount: 4 }),
      pref({ id: "b", rankBucket: "high", confidence: 0.6, comparisonCount: 2 }),
    ];
    const decisions: DecisionEvent[] = [decision("triage"), decision("pairwise_compare")];

    const { container } = render(
      <SessionAnalytics
        preferences={preferences}
        decisions={decisions}
        totalItems={8}
        sessionCreatedAt={new Date("2026-06-22T12:00:00Z")}
      />
    );

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/\bof\s+\d/i); // "of 8 items"
    expect(text).not.toMatch(/per min/i);
    expect(text).not.toMatch(/coverage/i);
    expect(text).not.toMatch(/decision rate/i);
    expect(text).not.toMatch(/\bcoverage\b/i);
  });
});
