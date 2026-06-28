// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { SessionAnalytics } from "./SessionAnalytics";
import type { CollectionPreferenceItem, DecisionEvent } from "@/types";

// Minimal render-only coverage. bead purses-gjr proposes reframing this
// component (KPI-dashboard-vs-tone), so these tests assert ONLY the current
// computed render and are expected to change when that reframe lands.

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
  beforeEach(() => {
    // Pin "now" so the Time Spent / Decision Rate figures are deterministic.
    // Session created 10 minutes before now → timeSpent = 10m.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T12:10:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the key computed figures from representative props", () => {
    const preferences: CollectionPreferenceItem[] = [
      pref({ id: "a", rankBucket: "top", confidence: 0.9, comparisonCount: 4 }),
      pref({ id: "b", rankBucket: "high", confidence: 0.9, comparisonCount: 2 }),
      pref({ id: "c", rankBucket: "medium", confidence: 0.6, comparisonCount: 2 }),
      pref({ id: "d", rankBucket: "low", confidence: 0.6, comparisonCount: 0 }),
    ];
    const decisions: DecisionEvent[] = [
      decision("triage"),
      decision("triage"),
      decision("triage"),
      decision("pairwise_compare"),
      decision("pairwise_compare"),
    ];

    render(
      <SessionAnalytics
        preferences={preferences}
        decisions={decisions}
        totalItems={8}
        sessionCreatedAt={new Date("2026-06-22T12:00:00Z")}
      />
    );

    // Decisions Made: 5 total, broken down 3 triage / 2 compare.
    const decisionsCard = screen.getByText("Decisions made").closest("div")!;
    expect(within(decisionsCard).getByText("5")).toBeInTheDocument();
    expect(within(decisionsCard).getByText("3 triage, 2 compare")).toBeInTheDocument();

    // Items Triaged: 4 of 8.
    const triagedCard = screen.getByText("Items triaged").closest("div")!;
    expect(within(triagedCard).getByText("4")).toBeInTheDocument();
    expect(within(triagedCard).getByText("of 8 items")).toBeInTheDocument();

    // Avg Confidence: (0.9+0.9+0.6+0.6)/4 = 0.75 → "75%".
    const confidenceCard = screen.getByText("Avg confidence").closest("div")!;
    expect(within(confidenceCard).getByText("75%")).toBeInTheDocument();

    // Time Spent: now − created = 10 minutes → "10m".
    const timeCard = screen.getByText("Time spent").closest("div")!;
    expect(within(timeCard).getByText("10m")).toBeInTheDocument();

    // Distribution buckets: one item per bucket label.
    const distribution = screen.getByText("Distribution").closest("div")!;
    expect(within(distribution).getByText("Love")).toBeInTheDocument();
    expect(within(distribution).getByText("Like")).toBeInTheDocument();
    expect(within(distribution).getByText("Maybe")).toBeInTheDocument();
    expect(within(distribution).getByText("Onward")).toBeInTheDocument();

    // Insights: avg comparisons (4+2+2+0)/4 = 2.0; coverage 4/8 = 50%;
    // confidence 0.75 → "Medium".
    const insights = screen.getByText("Insights").closest("div")!;
    expect(within(insights).getByText("2.0")).toBeInTheDocument();
    expect(within(insights).getByText("50%")).toBeInTheDocument();
    expect(within(insights).getByText("Medium")).toBeInTheDocument();
  });

  it("renders the empty / zero-data case without crashing or dividing by zero", () => {
    render(
      <SessionAnalytics
        preferences={[]}
        decisions={[]}
        totalItems={0}
        sessionCreatedAt={new Date("2026-06-22T12:10:00Z")}
      />
    );

    // No decisions, no triaged items.
    const decisionsCard = screen.getByText("Decisions made").closest("div")!;
    expect(within(decisionsCard).getByText("0")).toBeInTheDocument();
    expect(within(decisionsCard).getByText("0 triage, 0 compare")).toBeInTheDocument();

    // Avg Confidence guards against /0 → "0%".
    const confidenceCard = screen.getByText("Avg confidence").closest("div")!;
    expect(within(confidenceCard).getByText("0%")).toBeInTheDocument();

    // Coverage guards against totalItems === 0 → "0%".
    const insights = screen.getByText("Insights").closest("div")!;
    expect(within(insights).getByText("0.0")).toBeInTheDocument(); // avg comparisons
    expect(within(insights).getByText("Low")).toBeInTheDocument(); // confidence 0 → Low
  });
});
