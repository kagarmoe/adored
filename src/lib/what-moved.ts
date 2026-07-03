// Pure derivation of "what moved" in a round: given the round's decisions and a
// client-supplied window [windowStartMs, windowEndMs] (the caller derives the end
// from an injectable nowMs), return a best-effort summary of the decisions whose
// server-time createdAt falls within the window, grouped by outcome.
//
// The input shape mirrors the domain DecisionEvent (type + createdAt + decision) but
// is kept minimal and decoupled so this module carries no domain dependency. createdAt
// may be a Date or an epoch-ms number.

type TriageResult = "top" | "high" | "medium" | "low";

export interface MovedDecision {
  type: "triage" | "pairwise_compare";
  createdAt: Date | number;
  decision:
    | { itemId: string; result: TriageResult }
    | { itemAId: string; itemBId: string; result: string };
}

export interface WhatMovedSummary {
  /** Triage → Love (top). */
  love: number;
  /** Triage → Like (high). */
  like: number;
  /** Triage → Maybe (medium). */
  maybe: number;
  /** Triage → Onward (low). */
  onward: number;
  /** Pairwise comparisons made (ranking). */
  ranked: number;
  /** All decisions counted inside the window. */
  total: number;
}

function toMs(at: Date | number): number {
  return typeof at === "number" ? at : at.getTime();
}

export function whatMoved(
  decisions: MovedDecision[],
  windowStartMs: number,
  windowEndMs: number,
): WhatMovedSummary {
  const summary: WhatMovedSummary = { love: 0, like: 0, maybe: 0, onward: 0, ranked: 0, total: 0 };

  for (const d of decisions) {
    const ms = toMs(d.createdAt);
    if (ms < windowStartMs || ms > windowEndMs) continue;
    summary.total += 1;

    if (d.type === "pairwise_compare") {
      summary.ranked += 1;
      continue;
    }

    const result = (d.decision as { result: TriageResult }).result;
    switch (result) {
      case "top":
        summary.love += 1;
        break;
      case "high":
        summary.like += 1;
        break;
      case "medium":
        summary.maybe += 1;
        break;
      case "low":
        summary.onward += 1;
        break;
    }
  }

  return summary;
}
