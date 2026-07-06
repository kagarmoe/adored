// Self-contained sample content for the /welcome walkthrough. No DB, no Blob —
// the images are committed under public/onboarding/ so they render offline.

import type { Item } from "@/types";

export type Tier = "love" | "like" | "maybe" | "onward";

export interface SampleItem {
  id: string;
  name: string;
  imageSrc: string;
}

// Five things a person might own — evocative, never shop-like. The names carry
// a story ("the" + the object), not a catalog SKU. Order is the displayed order:
// the compare pair leads, then the triage items with the not-yours item third.
export const SAMPLE_ITEMS: readonly SampleItem[] = [
  { id: "armchair", name: "The slipcovered armchair", imageSrc: "/onboarding/slipcovered-armchair.webp" },
  { id: "clock", name: "The little red wall clock", imageSrc: "/onboarding/red-wall-clock.webp" },
  { id: "vase", name: "The glass flower vase", imageSrc: "/onboarding/glass-flower-vase.webp" },
  { id: "books", name: "The shelf of well-read books", imageSrc: "/onboarding/bookshelf.webp" },
  { id: "cushion", name: "The kid's microphone cushion", imageSrc: "/onboarding/microphone-cushion.webp" },
] as const;

// The two items the compare beat pits against each other.
export const COMPARE_PAIR: readonly [SampleItem, SampleItem] = [
  SAMPLE_ITEMS[0],
  SAMPLE_ITEMS[1],
];

// The items the triage beat asks about, one at a time.
export const TRIAGE_ITEMS: readonly SampleItem[] = [
  SAMPLE_ITEMS[2],
  SAMPLE_ITEMS[3],
  SAMPLE_ITEMS[4],
];

interface StandingRow {
  item: SampleItem;
  tier: Tier;
}

// The outcome of triaging a single item: a felt tier, or stepping it out of the
// ranking entirely (kept for later, or set gently aside).
export type TriageOutcome =
  | { kind: "tier"; tier: Tier }
  | { kind: "deferred" }
  | { kind: "setAside" };

// The outcome of the compare beat: one item reached for, a tie, or a skip.
export type CompareOutcome =
  | { kind: "win"; winnerId: string }
  | { kind: "tie" }
  | { kind: "skip" };

export interface Standing {
  ranked: StandingRow[]; // hero = ranked[0] when non-empty
  deferred: SampleItem[]; // "Ready when you are"
  setAside: SampleItem[]; // "Waiting, whenever you want them"
}

// Maps ScoringService result buckets to the walkthrough's felt tiers, so later
// beats can render real scoring output in the same demo vocabulary.
export const RESULT_TO_TIER: Record<"top" | "high" | "medium" | "low", Tier> = {
  top: "love",
  high: "like",
  medium: "maybe",
  low: "onward",
};

const TIER_ORDER: Record<Tier, number> = { love: 0, like: 1, maybe: 2, onward: 3 };

// demo-only mapping (tie→both love, skip→both like) — NOT ScoringService
// semantics; do not port.
function compareTier(item: SampleItem, compare: CompareOutcome): Tier {
  switch (compare.kind) {
    case "win":
      return item.id === compare.winnerId ? "love" : "like";
    case "tie":
      return "love";
    case "skip":
      return "like";
  }
}

/**
 * The "earned aha": the ranking reflects the user's taps, not a fixed order.
 *
 * Pure and deterministic over typed outcomes, so illegal states are
 * unrepresentable. The compare pair and triage items are disjoint by
 * construction. `ranked` combines the compare-pair rows (tiered by the compare
 * outcome) with the tiered triage rows, sorted by tier (love > like > maybe >
 * onward); within a tier, rows keep SAMPLE_ITEMS display order. Deferred and
 * set-aside triage items leave the ranking for their own groups. No API, no DB.
 */
export function buildStanding(
  compare: CompareOutcome,
  triage: Record<string, TriageOutcome>,
): Standing {
  const compareIds = new Set(COMPARE_PAIR.map((i) => i.id));

  const ranked: StandingRow[] = [];
  const deferred: SampleItem[] = [];
  const setAside: SampleItem[] = [];

  // Walk in SAMPLE_ITEMS display order so a stable tier sort preserves it.
  for (const item of SAMPLE_ITEMS) {
    if (compareIds.has(item.id)) {
      ranked.push({ item, tier: compareTier(item, compare) });
      continue;
    }
    const outcome = triage[item.id];
    if (!outcome || outcome.kind === "tier") {
      ranked.push({ item, tier: outcome ? outcome.tier : "maybe" });
    } else if (outcome.kind === "deferred") {
      deferred.push(item);
    } else {
      setAside.push(item);
    }
  }

  // Stable sort: equal tiers keep the SAMPLE_ITEMS order established above.
  ranked.sort((x, y) => TIER_ORDER[x.tier] - TIER_ORDER[y.tier]);

  return { ranked, deferred, setAside };
}

/**
 * A complete fabricated domain Item for a sample, so the walkthrough can reuse
 * the real CompareChoice UI without a DB. Every field is filled to satisfy the
 * Item type with no casts: fixed collection, null metadata, fixed unit/dates.
 */
export function toItem(sample: SampleItem): Item {
  return {
    id: sample.id,
    collectionId: "welcome-demo",
    name: sample.name,
    brand: null,
    style: null,
    color: null,
    material: null,
    category: null,
    number: null,
    height: null,
    width: null,
    depth: null,
    weight: null,
    unit: "in",
    status: null,
    notes: null,
    story: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
  };
}
