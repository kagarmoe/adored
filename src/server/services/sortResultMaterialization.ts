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
 * Pure: rank a curator's preferences into computed items — tier first (spec §4),
 * then the pair-derived orderRank within the tier (unordered rows last), then
 * itemId. orderRank only exists for Love + Like, so it never lifts a lower tier.
 */
export function rankPreferencesToItems(
  preferences: CollectionPreferenceItem[],
): MaterializedItem[] {
  return [...preferences]
    .sort((a, b) => {
      const byTier = BUCKET_PRIORITY[a.rankBucket] - BUCKET_PRIORITY[b.rankBucket];
      if (byTier !== 0) return byTier;
      if (a.orderRank !== b.orderRank) {
        if (a.orderRank === null) return 1;
        if (b.orderRank === null) return -1;
        return a.orderRank - b.orderRank;
      }
      return compareItemId(a.itemId, b.itemId);
    })
    .map((pref, index) => ({
      itemId: pref.itemId,
      computedRank: index,
      computedBucket: pref.rankBucket,
    }));
}

function compareItemId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
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
