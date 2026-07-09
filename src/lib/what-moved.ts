// Pure derivation of "what moved" in a round: given the round's decisions and a
// client-supplied window [windowStartMs, windowEndMs] (the caller derives the end
// from an injectable nowMs), return a best-effort summary of the decisions whose
// server-time createdAt falls within the window, grouped by outcome.
//
// The input shape mirrors the domain DecisionEvent (type + createdAt + decision) but
// is kept minimal and decoupled so this module carries no domain dependency. createdAt
// may be a Date or an epoch-ms number.

type TriageResult = "top" | "high" | "medium" | "low";
type UsageResult = "uses" | "not_uses";

export interface MovedDecision {
  type: "triage" | "pairwise_compare" | "usage";
  createdAt: Date | number;
  decision:
    | { itemId: string; result: TriageResult }
    | { itemAId: string; itemBId: string; result: string }
    | { itemId: string; result: UsageResult };
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
  /** Usage → in your life ("uses"). */
  uses: number;
  /** Usage → resting for now ("not_uses"). */
  resting: number;
  /** All decisions counted inside the window. */
  total: number;
}

// The two usage recap lines' one home ("{n} in your life" / "{n} resting for now",
// spec §4). Count-first, affirming (F20) — the leading number is the by-design count,
// never a remaining tally. One home so the recap surface and the TONE register scan
// assert against the same template.
export const inYourLifeLine = (n: number): string => `${n} in your life`;
export const restingLine = (n: number): string => `${n} resting for now`;

function toMs(at: Date | number): number {
  return typeof at === "number" ? at : at.getTime();
}

export function whatMoved(
  decisions: MovedDecision[],
  windowStartMs: number,
  windowEndMs: number,
): WhatMovedSummary {
  const summary: WhatMovedSummary = {
    love: 0,
    like: 0,
    maybe: 0,
    onward: 0,
    ranked: 0,
    uses: 0,
    resting: 0,
    total: 0,
  };

  for (const d of decisions) {
    const ms = toMs(d.createdAt);
    if (ms < windowStartMs || ms > windowEndMs) continue;
    summary.total += 1;

    if (d.type === "pairwise_compare") {
      summary.ranked += 1;
      continue;
    }

    if (d.type === "usage") {
      const usageResult = (d.decision as { result: UsageResult }).result;
      if (usageResult === "uses") summary.uses += 1;
      else summary.resting += 1;
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
