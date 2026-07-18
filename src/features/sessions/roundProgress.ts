// Pure progress-line derivations for the sort session hub and the workspace
// resume card (spec §B). Every function returns null when the line should be
// OMITTED — absence is quieter than rendering "0 of 100" (TONE).
import type { CollectionPreferenceItem } from "@/types";

/** "38 of 100 sorted by feel" — triage card. Omit at 0 decided or 0 items. */
export function triageProgress(decidedCount: number, totalItems: number): string | null {
  if (decidedCount <= 0 || totalItems <= 0) return null;
  return `${decidedCount} of ${totalItems} sorted by feel`;
}

/** "41 answered" — usage card. Omit at 0 answered. */
export function usageProgress(answeredCount: number): string | null {
  if (answeredCount <= 0) return null;
  return `${answeredCount} answered`;
}

/** "38 of 100 sorted so far" — workspace resume card meta line. Same omission
 * rule as triageProgress, distinct copy (accomplished-count framing, spec §B
 * last bullet — not the hub's "sorted by feel"). */
export function workspaceMeta(decidedCount: number, totalItems: number): string | null {
  if (decidedCount <= 0 || totalItems <= 0) return null;
  return `${decidedCount} of ${totalItems} sorted so far`;
}

// Mean confidence across items that have been part of at least one comparison
// (comparisonCount > 0) reaching this bucket flips the message from "taking
// shape" to "nearly settled". The honest stability contract (spec §B, amended
// after review): more comparisons/confidence on the SAME already-compared set
// never demotes the message — but a newly-compared item entering the mean MAY
// reset "nearly settled" back to "taking shape". That's real new information
// (a fresh item just entered the ranking with low confidence), not a bug, so
// it's a deliberate, documented exception rather than a monotonicity violation.
const NEARLY_SETTLED_THRESHOLD = 0.7;

/**
 * Qualitative-only compare progress (spec §B: no bars, no percentages).
 * Null when nothing has been compared anywhere; otherwise a two-tier message
 * driven by mean `confidence` (persisted, range 0..1, = min(1, comparisonCount/10))
 * over items that have entered at least one comparison.
 */
export function compareProgress(preferences: readonly CollectionPreferenceItem[]): string | null {
  const compared = preferences.filter((p) => p.comparisonCount > 0);
  if (compared.length === 0) return null;
  const meanConfidence = compared.reduce((sum, p) => sum + p.confidence, 0) / compared.length;
  return meanConfidence >= NEARLY_SETTLED_THRESHOLD
    ? "Your ranking is nearly settled."
    : "Your ranking is taking shape.";
}
