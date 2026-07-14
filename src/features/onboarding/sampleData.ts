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
// a story ("the" + the object), not a catalog SKU. The tutorial uses the first
// three as the sample collection; the others remain available for future beats.
export const SAMPLE_ITEMS: readonly SampleItem[] = [
  { id: "armchair", name: "The slipcovered armchair", imageSrc: "/onboarding/slipcovered-armchair.webp" },
  { id: "clock", name: "The little red wall clock", imageSrc: "/onboarding/red-wall-clock.webp" },
  { id: "vase", name: "The glass flower vase", imageSrc: "/onboarding/glass-flower-vase.webp" },
  { id: "books", name: "The shelf of well-read books", imageSrc: "/onboarding/bookshelf.webp" },
  { id: "cushion", name: "The kid's microphone cushion", imageSrc: "/onboarding/microphone-cushion.webp" },
] as const;

// The initial pair shown if the tutorial reaches Compare before a dynamic pair
// is selected. The walkthrough normally derives pairs from the triaged standing.
export const COMPARE_PAIR: readonly [SampleItem, SampleItem] = [
  SAMPLE_ITEMS[0],
  SAMPLE_ITEMS[1],
];

// The items the triage beat asks about, one at a time.
export const TRIAGE_ITEMS: readonly SampleItem[] = [
  SAMPLE_ITEMS[0],
  SAMPLE_ITEMS[1],
  SAMPLE_ITEMS[2],
];

export const USAGE_ITEMS: readonly SampleItem[] = TRIAGE_ITEMS;

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

// The outcome of the usage teaching beat: in use, resting, or passed (Skip for now).
export type UsageOutcome =
  | { kind: "used" }
  | { kind: "unused" }
  | { kind: "pass" };

export interface CompareRoundResult {
  itemAId: string;
  itemBId: string;
  outcome: CompareOutcome;
}

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

/**
 * The "earned aha": the ranking reflects the user's taps, not a fixed order.
 *
 * Pure and deterministic over typed outcomes, so illegal states are
 * unrepresentable. `ranked` starts from the Triage standing, then pairwise
 * Compare rounds add demo-only wins that can move pieces within the same sample
 * collection. Deferred and set-aside triage items leave the ranking for their
 * own groups. No API, no DB.
 */
export function buildStanding(
  comparisons: CompareRoundResult[],
  triage: Record<string, TriageOutcome>,
): Standing {
  const standing = buildTriageStanding(triage);
  if (comparisons.length === 0) return standing;

  const triageRank = new Map(standing.ranked.map((row, index) => [row.item.id, index]));
  const wins = new Map(standing.ranked.map((row) => [row.item.id, 0]));

  for (const comparison of comparisons) {
    if (comparison.outcome.kind === "skip") continue;
    if (comparison.outcome.kind === "tie") {
      wins.set(comparison.itemAId, (wins.get(comparison.itemAId) ?? 0) + 0.5);
      wins.set(comparison.itemBId, (wins.get(comparison.itemBId) ?? 0) + 0.5);
      continue;
    }
    wins.set(comparison.outcome.winnerId, (wins.get(comparison.outcome.winnerId) ?? 0) + 1);
  }

  return {
    ...standing,
    ranked: [...standing.ranked].sort((a, b) => {
      const byWins = (wins.get(b.item.id) ?? 0) - (wins.get(a.item.id) ?? 0);
      if (byWins !== 0) return byWins;
      return (triageRank.get(a.item.id) ?? 0) - (triageRank.get(b.item.id) ?? 0);
    }),
  };
}

export function buildTriageStanding(triage: Record<string, TriageOutcome>): Standing {
  const ranked: StandingRow[] = [];
  const deferred: SampleItem[] = [];
  const setAside: SampleItem[] = [];

  for (const item of TRIAGE_ITEMS) {
    const outcome = triage[item.id];
    if (!outcome || outcome.kind === "tier") {
      ranked.push({ item, tier: outcome ? outcome.tier : "maybe" });
    } else if (outcome.kind === "deferred") {
      deferred.push(item);
    } else {
      setAside.push(item);
    }
  }

  ranked.sort((x, y) => TIER_ORDER[x.tier] - TIER_ORDER[y.tier]);
  return { ranked, deferred, setAside };
}

export function comparePairsFor(standing: Standing): Array<readonly [SampleItem, SampleItem]> {
  const rankedItems = standing.ranked.map((row) => row.item);
  const pairs: Array<readonly [SampleItem, SampleItem]> = [];
  for (let i = 0; i < rankedItems.length; i++) {
    for (let j = i + 1; j < rankedItems.length; j++) {
      pairs.push([rankedItems[i], rankedItems[j]]);
    }
  }
  return pairs;
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
