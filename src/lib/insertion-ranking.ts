import { compareByCreatedAtThenId } from "./decision-order";

export type Bucket = "top" | "high" | "medium" | "low";

// The single source of truth for which buckets carry an insertion order: only
// Love (top) + Like (high). Both entry points — the live selector
// (pairwise-selection) and the recompute path (PreferenceStateService) — import
// THIS set, so "both agree on the ranked scope" is structurally guaranteed rather
// than two copies that could drift. medium/low and any unplaced top/high stay
// orderRank = null.
export const RANKABLE_BUCKETS: ReadonlySet<Bucket> = new Set<Bucket>(["top", "high"]);

export interface ComparisonEvent {
  aId: string;
  bId: string;
  result: "item_a" | "item_b" | "tie" | "skip";
  createdAt: Date;
  id: string;
}

export type Outcome = "x_more" | "y_more" | "tie" | "skip" | "unknown";

function isAfter(a: ComparisonEvent, b: ComparisonEvent): boolean {
  return compareByCreatedAtThenId(a, b) > 0;
}

export function latestOutcome(comparisons: ComparisonEvent[], x: string, y: string): Outcome {
  let latest: ComparisonEvent | null = null;
  for (const c of comparisons) {
    const matches = (c.aId === x && c.bId === y) || (c.aId === y && c.bId === x);
    if (!matches) continue;
    if (latest === null || isAfter(c, latest)) latest = c;
  }
  if (latest === null) return "unknown";
  if (latest.result === "tie") return "tie";
  if (latest.result === "skip") return "skip";
  // result is item_a or item_b, expressed in stored (aId,bId) direction; orient to x.
  const winnerId = latest.result === "item_a" ? latest.aId : latest.bId;
  return winnerId === x ? "x_more" : "y_more";
}

export type Placement =
  | { status: "placed"; index: number }
  | { status: "pending"; pivotId: string }
  | { status: "skipped" };

export function placeItem(x: string, ordered: string[], comparisons: ComparisonEvent[]): Placement {
  let lo = 0;
  let hi = ordered.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const pivot = ordered[mid];
    const o = latestOutcome(comparisons, x, pivot);
    if (o === "unknown") return { status: "pending", pivotId: pivot };
    if (o === "skip") return { status: "skipped" };
    if (o === "x_more") {
      hi = mid; // x is more loved => earlier slot
    } else {
      // y_more or tie => x sits at/after the pivot
      lo = mid + 1;
    }
  }
  return { status: "placed", index: lo };
}

export interface RankItem {
  id: string;
  createdAt: Date;
}

// A pairwise decision's payload. The event's `decision` may be this or a triage
// payload; only pairwise events (type === "pairwise_compare") carry this shape.
interface PairwisePayload {
  itemAId: string;
  itemBId: string;
  result: "item_a" | "item_b" | "tie" | "skip";
}

// Shape of a persisted decision event, as both the live selector and the recompute
// path see it. Kept structural (not tied to @/types) so this pure module has no domain
// dependency. `decision` is unknown here because the event union carries triage OR
// pairwise payloads; toComparisonEvents narrows to pairwise after filtering by type.
export interface DecisionEventLike {
  id: string;
  type: string;
  createdAt: Date;
  decision: unknown;
}

/**
 * Map persisted decision events to the engine's ComparisonEvent[]. This is the ONE
 * mapping both the live "next pair" selector and PreferenceStateService.recompute use,
 * so both entry points ask the same next question. Non-pairwise events are dropped;
 * the surviving events' `decision` is a pairwise payload by construction.
 */
export function toComparisonEvents(events: DecisionEventLike[]): ComparisonEvent[] {
  return events
    .filter((e) => e.type === "pairwise_compare")
    .map((e) => {
      const d = e.decision as PairwisePayload;
      return {
        aId: d.itemAId,
        bId: d.itemBId,
        result: d.result,
        createdAt: e.createdAt,
        id: e.id,
      };
    });
}

export interface DerivedOrder {
  order: string[];
  unplaced: string[];
  nextPair: [string, string] | null;
}

function canonicalSequence(rankable: RankItem[]): RankItem[] {
  return [...rankable].sort(compareByCreatedAtThenId);
}

export function deriveOrder(rankable: RankItem[], comparisons: ComparisonEvent[]): DerivedOrder {
  const order: string[] = [];
  const unplaced: string[] = [];
  let nextPair: [string, string] | null = null;

  for (const item of canonicalSequence(rankable)) {
    const p = placeItem(item.id, order, comparisons);
    if (p.status === "placed") {
      order.splice(p.index, 0, item.id);
    } else if (p.status === "skipped") {
      unplaced.push(item.id);
    } else {
      // pending: this is the first unanswered question; record it and stop placing further
      // items (their positions depend on this one). They resurface on the next recompute.
      unplaced.push(item.id);
      if (nextPair === null) nextPair = [item.id, p.pivotId];
    }
  }
  return { order, unplaced, nextPair };
}
