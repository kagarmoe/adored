import type { RankBucket } from "@/types/domain";

// Single source of truth for partitioning ranked results into "loved" vs "onward".
// Reuses the domain RankBucket union so the results page and the data layer agree.
export type Bucket = RankBucket;

export const LOVED_BUCKETS = ["top", "high", "medium"] as const;

/** A manual override of a valid bucket wins over the computed one. */
export function effectiveBucket(ri: {
  manualBucket: Bucket | null;
  computedBucket: Bucket;
}): Bucket {
  return ri.manualBucket ?? ri.computedBucket;
}

export function isOnward(b: Bucket): boolean {
  return b === "low";
}

export function partitionRanked<
  T extends { manualBucket: Bucket | null; computedBucket: Bucket },
>(items: T[]): { loved: T[]; onward: T[] } {
  const loved: T[] = [];
  const onward: T[] = [];
  for (const item of items) {
    if (isOnward(effectiveBucket(item))) {
      onward.push(item);
    } else {
      loved.push(item);
    }
  }
  return { loved, onward };
}
