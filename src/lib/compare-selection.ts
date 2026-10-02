import type { CollectionPreferenceItem, Item, RankBucket } from "@/types";

// The comparable set (spec §4): live pieces felt as Love or Like. Pair selection
// and order derivation both call THIS function, so the order a pair answer builds
// is the order the ranking shows — they agree by construction.
const COMPARABLE_BUCKETS: ReadonlySet<RankBucket> = new Set<RankBucket>(["top", "high"]);

export function selectComparableItems(
  items: readonly Item[],
  preferences: readonly CollectionPreferenceItem[],
): Item[] {
  const bucketOf = new Map(preferences.map((p) => [p.itemId, p.rankBucket]));
  return items.filter((item) => {
    const bucket = bucketOf.get(item.id);
    return item.deletedAt === null && bucket !== undefined && COMPARABLE_BUCKETS.has(bucket);
  });
}
