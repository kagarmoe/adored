import type {
  CollectionPreferenceItem,
  RankBucket,
  SortResultItem,
} from "@/types";
import { effectiveBucket } from "@/lib/results-buckets";

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

/** A hand-placed piece in the open draft: its 1-based slot in the loved list. */
export interface Pin {
  itemId: string;
  position: number;
  pinnedAt: Date;
}

export interface RankingEntry<B extends RankBucket = RankBucket> {
  itemId: string;
  bucket: B;
  pinned: boolean;
}

/** Love, Like, Maybe — the buckets the loved list (and its pins) cover. */
export type LovedBucket = Exclude<RankBucket, "low">;

/**
 * Pure: lay pinned pieces into their slots and fill the rest in derived order
 * (spec §4: later pair answers never move a pinned piece). A pin past either end
 * clamps; two pins on one slot keep the newer there and move the older to the
 * next free slot. Pins for pieces not in `derived` are ignored — nothing is ever
 * added or lost.
 */
export function applyPins<T extends { itemId: string }>(derived: readonly T[], pins: readonly Pin[]): T[] {
  const byId = new Map(derived.map((d) => [d.itemId, d]));
  const ordered = pins
    .flatMap((p) => {
      const entry = byId.get(p.itemId);
      return entry ? [{ ...p, entry }] : [];
    })
    .sort(
      (a, b) =>
        a.position - b.position ||
        b.pinnedAt.getTime() - a.pinnedAt.getTime() ||
        compareItemId(a.itemId, b.itemId),
    );
  const slots: (T | null)[] = derived.map(() => null);
  const pinned = new Set<string>();
  for (const pin of ordered) {
    if (pinned.has(pin.itemId)) continue;
    let i = Math.min(Math.max(pin.position, 1), slots.length) - 1;
    while (i < slots.length && slots[i] !== null) i++;
    if (i === slots.length) i = slots.lastIndexOf(null);
    slots[i] = pin.entry;
    pinned.add(pin.itemId);
  }
  const rest = derived.filter((d) => !pinned.has(d.itemId));
  let next = 0;
  return slots.map((slot) => slot ?? rest[next++]);
}

/**
 * Pure: the pins a hand move writes — the same splice the list makes on screen.
 * `shown` is the loved order as laid out now. The moved piece takes its slot and
 * every other pin is re-stated at the slot it shows after the splice, so a dense
 * list (every piece pinned after Make a revision) shifts the pieces it passes
 * instead of wrapping one into the gap. Returns only the pins whose slot changes.
 */
export function placePin(
  shown: readonly string[],
  pins: readonly Pin[],
  itemId: string,
  position: number,
): Map<string, number> {
  const from = shown.indexOf(itemId);
  if (from === -1) return new Map([[itemId, position]]);
  const to = Math.min(Math.max(position, 1), shown.length) - 1;
  const next = [...shown];
  next.splice(from, 1);
  next.splice(to, 0, itemId);
  const moves = new Map([[itemId, to + 1]]);
  for (const p of pins) {
    const slot = next.indexOf(p.itemId) + 1;
    if (p.itemId !== itemId && slot > 0 && slot !== p.position) moves.set(p.itemId, slot);
  }
  return moves;
}

/**
 * Pure: the live ranking (spec §4) — tier-first derived order for live pieces,
 * pins applied inside the loved list (Love, Like, Maybe), Onward as its own row.
 * Shared by the Ranking page and Save-and-share, so what you see is what is saved.
 */
export function buildRanking(
  preferences: readonly CollectionPreferenceItem[],
  liveItemIds: ReadonlySet<string>,
  pins: readonly Pin[],
): { loved: RankingEntry<LovedBucket>[]; onward: RankingEntry[] } {
  const ranked = rankPreferencesToItems(preferences.filter((p) => liveItemIds.has(p.itemId)));
  const pinnedIds = new Set(pins.map((p) => p.itemId));
  const lovedRanked = ranked.flatMap((m) =>
    m.computedBucket === "low" ? [] : [{ itemId: m.itemId, bucket: m.computedBucket, pinned: pinnedIds.has(m.itemId) }],
  );
  const loved = applyPins(lovedRanked, pins);
  const onward = ranked
    .filter((m) => m.computedBucket === "low")
    .map((m) => ({ itemId: m.itemId, bucket: m.computedBucket, pinned: false }));
  return { loved, onward };
}

/**
 * Pure: the open draft's pins. `manualRank` keeps its existing 0-based convention
 * (the legacy "Adjust results" rank space); a Pin is the 1-based slot, so reading
 * a row adds 1 here and every writer stores `position - 1`.
 */
export function pinsFromRows(rows: readonly SortResultItem[]): Pin[] {
  return rows.flatMap((r) =>
    r.manualRank === null ? [] : [{ itemId: r.itemId, position: r.manualRank + 1, pinnedAt: r.updatedAt }],
  );
}

/** Pure: a saved ranking's loved order as 0-based slots, ready for manualRank (Onward excluded). */
export function savedOrderPositions(rows: readonly SortResultItem[]): Map<string, number> {
  const ordered = [...rows].sort(
    (a, b) => (a.manualRank ?? a.computedRank) - (b.manualRank ?? b.computedRank),
  );
  return new Map(
    ordered.filter((r) => effectiveBucket(r) !== "low").map((r, i) => [r.itemId, i]),
  );
}
