import type {
  CollectionPreferenceItem,
  RankBucket,
  SortResultItem,
} from "@/types";

/** The computed-only item shape that SortResultItemRepository.create consumes. */
export interface MaterializedItem {
  itemId: string;
  computedRank: number;
  computedBucket: RankBucket;
}

const BUCKET_PRIORITY: Record<RankBucket, number> = {
  top: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Pure: rank a curator's preferences into computed items. Orders by bucket
 * priority (top<high<medium<low), then orderRank ascending with NULLS LAST, then
 * itemId ascending as a stable tiebreak — 0-based computedRank, computedBucket
 * taken from each preference's rankBucket. A loved (top/high) item never given an
 * orderRank still appears, after the ranked ones in its bucket. No DB. (Does not
 * mutate the input array.)
 */
export function rankPreferencesToItems(
  preferences: CollectionPreferenceItem[],
): MaterializedItem[] {
  return [...preferences]
    .sort((a, b) => {
      const pa = BUCKET_PRIORITY[a.rankBucket];
      const pb = BUCKET_PRIORITY[b.rankBucket];
      if (pa !== pb) return pa - pb;
      const ra = a.orderRank ?? Number.POSITIVE_INFINITY;
      const rb = b.orderRank ?? Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
    })
    .map((pref, index) => ({
      itemId: pref.itemId,
      computedRank: index,
      computedBucket: pref.rankBucket,
    }));
}

/**
 * Pure: clone a finalized result's items into the computed-only create shape,
 * dropping any manual overrides (the repo hard-codes manualRank/manualBucket to
 * null, so the clone carries no manual fields).
 */
export function cloneItemsFrom(items: SortResultItem[]): MaterializedItem[] {
  return items.map((item) => ({
    itemId: item.itemId,
    computedRank: item.computedRank,
    computedBucket: item.computedBucket,
  }));
}
