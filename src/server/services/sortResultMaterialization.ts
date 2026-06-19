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

/**
 * Pure: rank a curator's preferences into computed items — highest score first,
 * 0-based computedRank, computedBucket taken from each preference's rankBucket.
 * No DB. (Does not mutate the input array.)
 */
export function rankPreferencesToItems(
  preferences: CollectionPreferenceItem[],
): MaterializedItem[] {
  return [...preferences]
    .sort((a, b) => b.score - a.score)
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
