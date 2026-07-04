import type { CollectionPreferenceItem, DecisionEvent, Disposition, Item } from "@/types";
import { selectTriageItem } from "@/lib/triage-selection";
import { selectNextPair } from "@/lib/pairwise-selection";

/**
 * Which round to gently steer the curator toward next, derived entirely from data
 * the hub already loads — no schema, no stored state. Person-side framing only:
 * this is the *recommendation*, never a tally or a "you still have N left" nag.
 *
 *  - untriaged items remain          → "triage"  ("Quick triage")
 *  - else a rankable pair remains    → "compare" ("Refine the top tier")
 *  - else                            → "decide"  (→ results)
 *
 * Reuses the same derivations the rounds themselves use (selectTriageItem /
 * selectNextPair over RANKABLE_BUCKETS) so the recommendation can never disagree
 * with what the round would actually show.
 */
export type NextRoundKind = "triage" | "compare" | "decide";

export interface NextRoundInput {
  items: Item[];
  preferences: CollectionPreferenceItem[];
  decisions: DecisionEvent[];
  dispositionByItemId?: Map<string, Disposition>;
}

export interface NextRound {
  kind: NextRoundKind;
  label: string;
  /** A calm, non-numeric affirmation of why this round comes next. */
  description: string;
  cta: string;
}

export function recommendNextRound(input: NextRoundInput): NextRound {
  const { items, preferences, decisions } = input;
  const dispositionByItemId = input.dispositionByItemId ?? new Map<string, Disposition>();

  const preferenceItemIds = new Set(preferences.map((p) => p.itemId));
  const { item } = selectTriageItem(items, preferenceItemIds, dispositionByItemId);
  if (item) {
    return {
      kind: "triage",
      label: "Quick triage",
      description: "A few pieces are still waiting for a first feeling.",
      cta: "Start triage",
    };
  }

  const pair = selectNextPair({ preferences, items, decisions, dispositionByItemId });
  if (pair) {
    return {
      kind: "compare",
      label: "Refine the top tier",
      description: "Compare the ones you love to see which you love most.",
      cta: "Refine",
    };
  }

  return {
    kind: "decide",
    label: "See what you love most",
    description: "You've thought through each one — take a look at what rose to the top.",
    cta: "See results",
  };
}
