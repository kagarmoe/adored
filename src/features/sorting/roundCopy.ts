// Sorting copy shared by the Sort screen and the /welcome walkthrough. One home
// so the two surfaces cannot fork (the walkthrough drifted once already).
// NOTE: this module carries no client directive — the server Sort page imports it.

export const ROUND_COPY = {
  triage: { explainer: "One at a time — how do you feel about each?" },
  compare: { explainer: "Two side by side — which would you reach for first?" },
} as const;

export const COMPARE_SUBLINE = "Tap the one you'd reach for. Tie or skip whenever you like.";

// The walkthrough's neutral kicker: one home so both Welcome beats assert against
// the same string.
export const WELCOME_ROUND_KICKER = "A sample sort";

// The person's word for each bucket — one home for every surface that names a tier.
export const BUCKET_LABELS = { top: "Love", high: "Like", medium: "Maybe", low: "Onward" } as const;

// The ScoringService result buckets a triage tap can carry. Narrowed (not
// `string`) so callers can index RESULT_TO_TIER without a cast, which
// compile-couples this list to that map's keys.
export type TriageResult = "top" | "high" | "medium" | "low";

// The four tier decisions, shaped for the decisions API. Caller-supplied labels
// were the walkthrough's original drift mechanism one level down — shared now.
export function triageDecisions(
  itemId: string,
): Array<{ label: string; decision: { itemId: string; result: TriageResult } }> {
  return (["top", "high", "medium", "low"] as const).map((result) => ({
    label: BUCKET_LABELS[result],
    decision: { itemId, result },
  }));
}
