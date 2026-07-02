// Self-contained sample content for the /welcome walkthrough. No DB, no Blob —
// the images are committed under public/onboarding/ so they render offline.

export type Tier = "love" | "like" | "maybe" | "onward";

export interface SampleItem {
  id: string;
  name: string;
  imageSrc: string;
}

// Five things a person might own — evocative, never shop-like. The names carry
// a story ("the" + the object), not a catalog SKU.
export const SAMPLE_ITEMS: readonly SampleItem[] = [
  { id: "armchair", name: "The slipcovered armchair", imageSrc: "/onboarding/slipcovered-armchair.webp" },
  { id: "clock", name: "The little red wall clock", imageSrc: "/onboarding/red-wall-clock.webp" },
  { id: "vase", name: "The glass flower vase", imageSrc: "/onboarding/glass-flower-vase.webp" },
  { id: "cushion", name: "The microphone throw cushion", imageSrc: "/onboarding/microphone-cushion.webp" },
  { id: "books", name: "The shelf of well-read books", imageSrc: "/onboarding/bookshelf.webp" },
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

export interface StandingRow {
  item: SampleItem;
  tier: Tier;
}

const TIER_ORDER: Record<Tier, number> = { love: 0, like: 1, maybe: 2, onward: 3 };

/**
 * The "earned aha": the ranking reflects the user's taps, not a fixed order.
 *
 * The compare winner ranks first, the passed-over item ranks second, then the
 * triaged items follow grouped by tier (Love above Like above Maybe above
 * Onward). Deterministic given the taps; no API, no DB.
 */
export function buildStanding(
  compareWinnerId: string,
  triageChoices: Record<string, Tier>
): StandingRow[] {
  const [a, b] = COMPARE_PAIR;
  const winner = a.id === compareWinnerId ? a : b;
  const passedOver = winner.id === a.id ? b : a;

  // The compare pair sits at the crown: the reach-for winner is most loved.
  const rows: StandingRow[] = [
    { item: winner, tier: "love" },
    { item: passedOver, tier: "like" },
  ];

  const triaged = TRIAGE_ITEMS.map((item) => ({
    item,
    tier: triageChoices[item.id] ?? "maybe",
  })).sort((x, y) => TIER_ORDER[x.tier] - TIER_ORDER[y.tier]);

  return [...rows, ...triaged];
}
