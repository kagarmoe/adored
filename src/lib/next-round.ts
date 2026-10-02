import type { CollectionPreferenceItem, DecisionEvent, Disposition, Item } from "@/types";
import { selectTriageItem } from "@/lib/triage-selection";
import { selectNextPair } from "@/lib/pairwise-selection";
import { selectUsageQueue } from "@/lib/usage-selection";
import { deriveUsage } from "@/lib/derive-usage";
import { ROUND_COPY } from "@/features/sorting/roundCopy";

/**
 * Which round to gently steer the curator toward next, derived entirely from data
 * the hub already loads — no schema, no stored state. Person-side framing only:
 * this is the *recommendation*, never a tally or a "you still have N left" nag.
 *
 *  - untriaged items remain           → "triage"  ("Quick triage")
 *  - else usage still unknown for one  → "usage"   ("Do you use this?")
 *  - else a comparable pair remains    → "compare" ("Compare")
 *  - else                             → "decide"  (→ results)
 *
 * Reuses the same derivations the rounds themselves use (selectTriageItem /
 * selectUsageQueue+deriveUsage / selectNextPair) so the
 * recommendation can never disagree with what the round would actually show (F6).
 */
export type NextRoundKind = "triage" | "usage" | "compare" | "decide";

export interface NextRoundInput {
  items: Item[];
  preferences: CollectionPreferenceItem[];
  /** The §2.6 cross-session curator log — drives usage-known derivation AND
   *  compare selection (selectNextPair), so both agree with the recompute.
   *  (§7.3 fixed: selectNextPair is curator-wide; the hub feeds its own
   *  session-scoped subset to SessionAnalytics, not this input.) */
  curatorDecisions: DecisionEvent[];
  dispositionByItemId?: Map<string, Disposition>;
}

export interface NextRound {
  kind: NextRoundKind;
  label: string;
  /** A calm, non-numeric affirmation of why this round comes next. */
  description: string;
  cta: string;
}

const TRIAGE_ROUND: NextRound = {
  kind: "triage",
  label: "Quick triage",
  description: "A few pieces are still waiting for a first feeling.",
  cta: "Start triage",
};

// label is ROUND_COPY.usage.name (one home — the hub grid card and this suggestion
// cannot fork); description + cta are the card's own copy per the triage/compare
// precedent. TONE items: non-numeric, no denominator.
const USAGE_ROUND: NextRound = {
  kind: "usage",
  label: ROUND_COPY.usage.name,
  description: "An easy pass — just whether each piece is in your life right now.",
  cta: "Begin",
};

const COMPARE_ROUND: NextRound = {
  kind: "compare",
  label: "Compare",
  description: "Put two pieces side by side and choose what rises.",
  cta: "Compare",
};

const DECIDE_ROUND: NextRound = {
  kind: "decide",
  label: "See what you love most",
  description: "You've thought through each one — take a look at what rose to the top.",
  cta: "See results",
};

function runLadder(input: NextRoundInput, includeUsage: boolean): NextRound {
  const { items, preferences, curatorDecisions } = input;
  const dispositionByItemId = input.dispositionByItemId ?? new Map<string, Disposition>();

  const preferenceItemIds = new Set(preferences.map((p) => p.itemId));
  const { item } = selectTriageItem(items, preferenceItemIds, dispositionByItemId);
  if (item) return TRIAGE_ROUND;

  if (includeUsage) {
    // Same selectors the usage round uses: latest usage event per live item wins,
    // queue is the usage-unknown, non-disposed remainder (F6 — agree by construction).
    const liveIds = new Set(items.map((i) => i.id));
    const usageByItemId = deriveUsage(curatorDecisions, liveIds);
    const usageQueue = selectUsageQueue(items, usageByItemId, dispositionByItemId);
    if (usageQueue.length > 0) return USAGE_ROUND;
  }

  // §7.3 (fixed): feed the CURATOR-WIDE log — the same log the preference recompute
  // reads — so this recommendation (and whenUsageDemoted's re-run, which shares this
  // ladder) can never disagree with what the recompute would need next. A pair already
  // ordered in a prior session is not re-recommended as "compare".
  const pair = selectNextPair({ preferences, items, decisions: curatorDecisions });
  if (pair) return COMPARE_ROUND;

  return DECIDE_ROUND;
}

export function recommendNextRound(input: NextRoundInput): {
  primary: NextRound;
  whenUsageDemoted?: NextRound;
} {
  const primary = runLadder(input, true);
  if (primary.kind === "usage") {
    // A device-local demotion the server can't see: re-run the ladder SKIPPING usage
    // (triage → compare → decide). Usage is NEVER re-promoted on a demoted device —
    // the always-present usage chooser card is the honored path back (§7.1, D5).
    return { primary, whenUsageDemoted: runLadder(input, false) };
  }
  return { primary };
}
