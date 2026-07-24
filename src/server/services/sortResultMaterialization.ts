import type {
  CollectionPreferenceItem,
  RankBucket,
  SortResultItem,
} from "@/types";

/** The item shape that SortResultItemRepository.create consumes. Carries the live
 *  manual bin overlay (purses-xxo7) so finalize freezes the effective composition;
 *  a fresh clone (revision) drops it. */
export interface MaterializedItem {
  itemId: string;
  computedRank: number;
  computedBucket: RankBucket;
  manualBucket: RankBucket | null;
}

const BUCKET_PRIORITY: Record<RankBucket, number> = {
  top: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Pure: rank a curator's preferences into computed items. Triage-only results
 * keep the historical bucket-first order. Once Compare has produced any
 * orderRank, ranked rows sort globally by orderRank so the pairwise order is
 * visible; unranked rows follow by bucket priority and itemId. No DB. (Does not
 * mutate the input array.)
 */
export function rankPreferencesToItems(
  preferences: CollectionPreferenceItem[],
): MaterializedItem[] {
  const hasCompareOrder = preferences.some((pref) => pref.orderRank !== null);

  return [...preferences]
    .sort((a, b) => {
      if (hasCompareOrder) {
        const aRank = a.orderRank;
        const bRank = b.orderRank;
        const aRanked = aRank !== null;
        const bRanked = bRank !== null;
        if (aRanked && bRanked) {
          if (aRank !== bRank) return aRank - bRank;
          return compareItemId(a.itemId, b.itemId);
        }
        if (aRanked !== bRanked) return aRanked ? -1 : 1;
      }

      const pa = BUCKET_PRIORITY[a.rankBucket];
      const pb = BUCKET_PRIORITY[b.rankBucket];
      if (pa !== pb) return pa - pb;
      return compareItemId(a.itemId, b.itemId);
    })
    .map((pref, index) => ({
      itemId: pref.itemId,
      computedRank: index,
      // ORDERING above uses the RAW rankBucket (a bin is a partition, not a rank);
      // computedBucket stays raw, and the live manual overlay rides alongside so a
      // finalize freezes the effective composition (purses-xxo7).
      computedBucket: pref.rankBucket,
      manualBucket: pref.manualBucket,
    }));
}

function compareItemId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Pure: clone a finalized result's items into the create shape, dropping any manual
 * overrides (fresh-fold: a revision re-derives, so manualBucket is null and the repo
 * still hard-codes manualRank to null).
 */
export function cloneItemsFrom(items: SortResultItem[]): MaterializedItem[] {
  return items.map((item) => ({
    itemId: item.itemId,
    computedRank: item.computedRank,
    computedBucket: item.computedBucket,
    manualBucket: null,
  }));
}
