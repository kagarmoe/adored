// Teaching copy displayed in BOTH the session hub and the /welcome walkthrough.
// One home so the two surfaces cannot fork (the walkthrough drifted once already).
// NOTE: this module carries no client directive — it is imported by the server hub page.

export const ROUND_COPY = {
  triage: { name: "Get acquainted", explainer: "One at a time — how do you feel about each?" },
  usage: { name: "Do you use this?", explainer: "One piece at a time — is it in your life these days?" },
  compare: { name: "Which do you love more?", explainer: "Two side by side — which do you love more?" },
} as const;

export const COMPARE_SUBLINE = "Tap the one you love more. Tie or skip whenever you like.";

// The /welcome walkthrough teaches with a NEUTRAL round noun distinct from the
// person-side arc names in ROUND_COPY (user decision): interpolating those names
// as "A <name> round" read awkwardly ("A Which do you love more? round"). One
// home so both Welcome beats assert against the same string.
export const WELCOME_ROUND_KICKER = "A sorting round";

// Usage-round pass button. The escape's contract lives in its accessible name
// (WCAG 2.5.3: the accessible name begins with the visible label) — this is the
// round copy's one home, mirroring the DeferControl precedent.
export const USAGE_PASS_LABEL = "Skip for now";
export const USAGE_PASS_TITLE = "It'll come around again";
export const USAGE_PASS_ARIA_LABEL = "Skip for now — it'll come around again";

// The ScoringService result buckets a triage tap can carry. Narrowed (not
// `string`) so callers can index RESULT_TO_TIER without a cast, which
// compile-couples this list to that map's keys.
export type TriageResult = "top" | "high" | "medium" | "low";

// The four tier decisions, shaped for the decisions API. Caller-supplied labels
// were the walkthrough's original drift mechanism one level down — shared now.
export function triageDecisions(
  itemId: string,
): Array<{ label: string; decision: { itemId: string; result: TriageResult } }> {
  return [
    { label: "Love", decision: { itemId, result: "top" } },
    { label: "Like", decision: { itemId, result: "high" } },
    { label: "Maybe", decision: { itemId, result: "medium" } },
    { label: "Onward", decision: { itemId, result: "low" } },
  ];
}

// The ScoringService result buckets a usage tap can carry.
export type UsageResult = "uses" | "not_uses";

// The two usage decisions, shaped for the decisions API (mirrors triageDecisions).
export function usageDecisions(
  itemId: string,
): Array<{ label: string; decision: { itemId: string; result: UsageResult } }> {
  return [
    { label: "Yes, I use it", decision: { itemId, result: "uses" } },
    { label: "Not these days", decision: { itemId, result: "not_uses" } },
  ];
}
