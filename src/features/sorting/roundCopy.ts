// Teaching copy displayed in BOTH the session hub and the /welcome walkthrough.
// One home so the two surfaces cannot fork (the walkthrough drifted once already).
// NOTE: this module carries no client directive — it is imported by the server hub page.

export const ROUND_COPY = {
  triage: { name: "Triage", explainer: "One at a time — how do you feel about each?" },
  compare: { name: "Compare", explainer: "Two side by side — which do you love more?" },
} as const;

export const COMPARE_SUBLINE = "Tap the one you love more. Tie or skip whenever you like.";

// The four tier decisions, shaped for the decisions API. Caller-supplied labels
// were the walkthrough's original drift mechanism one level down — shared now.
export function triageDecisions(itemId: string) {
  return [
    { label: "Love", decision: { itemId, result: "top" } },
    { label: "Like", decision: { itemId, result: "high" } },
    { label: "Maybe", decision: { itemId, result: "medium" } },
    { label: "Onward", decision: { itemId, result: "low" } },
  ];
}
