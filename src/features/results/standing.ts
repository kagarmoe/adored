import type { CollectionPreferenceItem, Item } from "@/types";
import { rankPreferencesToItems } from "@/server/services/sortResultMaterialization";
import { partitionRanked, type Bucket } from "@/lib/results-buckets";
import type { RankedJoinedRow, RankedRow } from "@/features/results/RankedResults";

/**
 * Pure: derive the live Standing's loved/onward rows from a curator's live
 * preferences — the SAME rankPreferencesToItems → partitionRanked/effectiveBucket
 * derivation a finalized snapshot uses (shared source of truth, spec §ranked-read).
 * Live preferences carry no manual overlay, so each row's manualBucket is null
 * (effectiveBucket then falls back to the computed bucket). Items missing from the
 * lookup are dropped. No DB, no engine call — orderRank is pre-materialized.
 */
export function deriveStanding(
  preferences: CollectionPreferenceItem[],
  itemById: Map<string, Item>,
): { loved: RankedJoinedRow[]; onward: RankedJoinedRow[] } {
  const rows: RankedRow[] = rankPreferencesToItems(preferences).map((m) => ({
    // A live pref has no snapshot row id; the itemId is a stable per-row key.
    id: m.itemId,
    itemId: m.itemId,
    computedBucket: m.computedBucket as Bucket,
    manualBucket: null,
  }));

  const { loved: lovedRows, onward: onwardRows } = partitionRanked(rows);
  const join = (rs: RankedRow[]): RankedJoinedRow[] =>
    rs
      .map((ri) => ({ ri, item: itemById.get(ri.itemId) }))
      .filter((r): r is RankedJoinedRow => Boolean(r.item));

  return { loved: join(lovedRows), onward: join(onwardRows) };
}
